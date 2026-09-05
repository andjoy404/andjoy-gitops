import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import { invalidateScope, READINESS_POLL_MS, readinessSyncInProgress } from '../services/scopeQueries'
import type { AnalyticsReadiness } from '../types'

type Scope = { envId?: number; groupId?: number | string }

/**
 * On environment/group selection, mark every scoped dataset cache entry as
 * stale so the active page fetches the current DB-backed data immediately
 * (and other mounted observers refresh in the same pass). Data keyed by a
 * different env/group is never evicted and never served to this scope.
 *
 * Mounted once high in the tree (Shell); the effect runs only when the
 * selected env or group actually changes, so Shell re-renders never trigger
 * extra work.
 *
 * Skips invalidation on the initial mount (useEffect dependency array does
 * not re-run on first render) so that pages load sequentially through their
 * own query observers instead of all 9 `invalidateScope` refetches firing
 * in the same tick as the page renders.
 */
export function useScopeRefresh(scope: Scope) {
  const queryClient = useQueryClient()
  const { envId, groupId } = scope
  useEffect(() => {
    if (envId === undefined || groupId === undefined) return
    invalidateScope(queryClient, { envId, groupId })
  }, [queryClient, envId, groupId])
}

/**
 * Watches the shared readiness signal for the active env+group and invalidates
 * the scoped datasets the moment the backend reports a fresh completed sync
 * (or data appearing). Polling continues only while a sync is incomplete:
 * the function-form `refetchInterval` re-evaluates on every observer
 * activation, stops at zero observers and on unmount, so nothing runs after
 * the component is gone.
 *
 * Mounted once in Shell so the signal is observed even before any data page
 * mounts. Pages that observe this exact key share the cached query, so the
 * endpoint is polled at most once per environment and group.
 */
export function useSyncRefresh(scope: Scope) {
  const queryClient = useQueryClient()
  const { envId, groupId } = scope
  const enabled = envId !== undefined && groupId !== undefined

  const { data, dataUpdatedAt } = useQuery<AnalyticsReadiness, Error>({
    queryKey: ['analytics-readiness', envId, groupId],
    queryFn: () => api.getAnalyticsReadiness(groupId as number),
    enabled,
    staleTime: 0,
    retry: false,
    refetchInterval: (query) =>
      readinessSyncInProgress(query.state.data) ? READINESS_POLL_MS : false,
  })

  /* Reset the change baseline whenever the scope changes so a new scope's
     first readiness value is never compared against the previous scope's. */
  const prevRef = useRef<AnalyticsReadiness | undefined>(undefined)
  const scopeKey = `${envId}:${groupId}`
  useEffect(() => {
    prevRef.current = undefined
  }, [scopeKey])

  useEffect(() => {
    if (!enabled || envId === undefined || groupId === undefined) return
    const prev = prevRef.current
    prevRef.current = data
    if (data === undefined || prev === undefined) return
    // A large group can spend several minutes collecting pipeline/job history.
    // Rows are committed progressively, so keep active DB-backed views fresh
    // during that window instead of waiting for the final completion marker.
    if (readinessSyncInProgress(data)) {
      invalidateScope(queryClient, { envId, groupId })
      return
    }
    const scopeChanged =
      (prev.last_completed_at ?? null) !== (data.last_completed_at ?? null)
    const becameReady = data.ready && !prev.ready
    const dataAppeared = data.data_available && !prev.data_available
    if (scopeChanged || becameReady || dataAppeared) {
      invalidateScope(queryClient, { envId, groupId })
    }
  }, [data, dataUpdatedAt, enabled, envId, groupId, queryClient])
}

/* ── Scoped on-demand refresh (Pipelines Refresh button) ─────────────────
 *
 * `useScopedRefresh` is the single owner of the explicit Refresh lifecycle.
 * The trigger request is fire-and-forget; the actual completion is tracked via
 * the readiness endpoint which the backend has made scope-aware (refreshScope
 * writes a sync state row per env+group, and readiness reflects it via
 * `scoped_syncing` / `scoped_error`). Exposed as `trigger` plus
 * `isRefreshing` / `isPolling` / a terminal `status`, the bounded poll:
 *   - stops as soon as the scoped readiness reports a settled state
 *     (completed, completed-with-error, or unauthorized) — the poll's own
 *     readiness reading, NOT the page's `ready` flag, which has no guaranteed
 *     polling interval and can be a stale `ready:false`;
 *   - stops on scope change (a poll for a different scope than the page's
 *     active env+group is torn down);
 *   - stops on unmount (refetchInterval is observer-driven and auto-cancels);
 *   - has a hard timeout + attempt cap so a stuck backend cannot spin forever;
 *   - never fires two overlapping polls for the same scope (dedup via the
 *     single `pollingScope` state + an `inFlightRef` guard against
 *     same-tick double-clicks);
 *   - on a settled (completed or completed-with-error) reading, invalidates
 *     the scoped datasets exactly once via `invalidateScope` so the active
 *     page refetches fresh data while keeping existing rows visible.
 *
 * Pass the page's active scope `{ envId, groupId }` so a poll that belongs to
 * a previous scope is torn down when the user navigates.
 */

export type RefreshStatus =
  | { kind: 'idle' }
  | { kind: 'pending'; message: string }
  | { kind: 'success' }
  | { kind: 'error'; message: string }
  | { kind: 'timeout' }

const REFRESH_TIMEOUT_MS = 30_000
const REFRESH_MAX_ATTEMPTS = 8

type PollKey = { envId: number; groupId: number }

function pollKeyFor(envId: number, groupId: number) {
  return `${envId}:${groupId}`
}

function isSettled(data: AnalyticsReadiness | null | undefined): boolean {
  // No data yet → keep polling.
  if (!data) return false
  // Backend tells us a scoped refresh for this group is still running.
  if (data.scoped_syncing === true) return false
  // No scoped signal (global fallback / multi-group call) → rely on ready.
  if (data.scoped_syncing == null) return data.ready
  // Scoped settled (false) → done.
  return true
}

function isUnauthorized(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status
  return status === 401 || status === 403
}

function userFacingError(err: unknown): string {
  if (isUnauthorized(err)) return 'You are not authorized to refresh.'
  const e = err as Error | undefined
  return e?.message ? `Refresh failed: ${e.message}` : 'Refresh failed. Please try again.'
}

export function useScopedRefresh(scope: Scope = {}) {
  const queryClient = useQueryClient()
  const [triggering, setTriggering] = useState(false)
  const [status, setStatus] = useState<RefreshStatus>({ kind: 'idle' })
  const [pollingScope, setPollingScope] = useState<PollKey | null>(null)

  const startedAtRef = useRef<number>(0)
  const attemptsRef = useRef<number>(0)
  const clearStatusTimerRef = useRef<number | null>(null)
  // Synchronous (ref, not state) registry of in-flight runs keyed by scope:
  // state updates from outside an event handler are not flushed between rapid
  // same-tick duplicate clicks, so state cannot dedupe them. Keys are dropped
  // on every terminal path, so a later Refresh click always starts a fresh
  // bounded run even though an older same-scope run's promise may still be
  // pending.
  const inFlightKeysRef = useRef<Set<string>>(new Set())
  // Monotonic per-scope run token: distinguishes a NEW same-scope run from a
  // still-pending OLDER same-scope run's late trigger response — the old run
  // owns its token; a later run supersedes it.
  const runSeqRef = useRef<Map<string, number>>(new Map())

  const pollingKey = pollingScope ? pollKeyFor(pollingScope.envId, pollingScope.groupId) : null
  const pollingKeyRef = useRef<string | null>(null)

  const { data: readinessData, error: readinessError } = useQuery<AnalyticsReadiness, Error>({
    queryKey:
      pollingKey != null
        ? ['analytics-refresh-poll', pollingScope?.envId, pollingScope?.groupId]
        : ['analytics-refresh-poll', 'disabled'],
    queryFn: () => api.getAnalyticsReadiness((pollingScope as PollKey).groupId),
    enabled: pollingKey != null,
    staleTime: 0,
    retry: false,
    initialData: undefined,
    refetchInterval: (query) => {
      const data = query.state.data as AnalyticsReadiness | null | undefined
      if (isSettled(data)) return false
      if (Date.now() - startedAtRef.current > REFRESH_TIMEOUT_MS) return false
      if (attemptsRef.current >= REFRESH_MAX_ATTEMPTS) return false
      attemptsRef.current += 1
      return READINESS_POLL_MS
    },
  })

  const scopeKey =
    scope.envId !== undefined && scope.groupId !== undefined
      ? `${scope.envId}:${scope.groupId}`
      : null

  /**
   * Single funnel for every terminal path — completed, failed, timeout,
   * HTTP error, trigger failure, scope change, unmount. It tears the poll
   * down, releases the run's in-flight key, and sets the terminal status in
   * one update, so a later Refresh click always starts a fresh bounded poll.
   */
  const stopRun = useCallback(
    (key: string | null, next: RefreshStatus) => {
      if (key != null) inFlightKeysRef.current.delete(key)
      setPollingScope(null)
      setTriggering(false)
      setStatus(next)
    },
    [],
  )

  // Run start → reset bounds so the timeout/attempt cap apply to this run
  // only. Run end (pollingKey → null on ANY terminal path) → drop the in-
  // flight key and reset the transient 'pending' status, so a later Refresh
  // click starts a fresh bounded poll with a clean status.
  useEffect(() => {
    pollingKeyRef.current = pollingKey
    if (pollingKey == null) {
      if (status.kind === 'pending') setStatus({ kind: 'idle' })
      return
    }
    startedAtRef.current = Date.now()
    attemptsRef.current = 1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingKey])

  // Settled readiness reading (completed, or completed-with-error) → stop the
  // poll, surface the terminal status, and invalidate the scope's datasets
  // exactly once so the active page refetches fresh data. Existing rows stay
  // visible until the refetch lands — `invalidateScope` marks them stale, it
  // does not evict them.
  useEffect(() => {
    if (pollingKey == null || pollingScope == null || !readinessData) return
    if (!isSettled(readinessData)) return
    const hadError = !!(readinessData.scoped_syncing === false && readinessData.scoped_error)
    invalidateScope(queryClient, { envId: pollingScope.envId, groupId: pollingScope.groupId })
    stopRun(
      pollingKey,
      hadError
        ? { kind: 'error', message: readinessData.scoped_error || 'Refresh failed. Please try again.' }
        : { kind: 'success' },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readinessData, pollingKey, pollingScope, queryClient])

  // Auto-clear the success/error notice after a reasonable delay so a page
  // doesn't hold a stale terminal status.
  const lastMessageKey =
    status.kind === 'success' || status.kind === 'error'
      ? `${status.kind}:${(status as { message?: string }).message ?? ''}`
      : null
  useEffect(() => {
    if (clearStatusTimerRef.current != null) {
      window.clearTimeout(clearStatusTimerRef.current)
      clearStatusTimerRef.current = null
    }
    if (lastMessageKey != null) {
      clearStatusTimerRef.current = window.setTimeout(() => {
        setStatus({ kind: 'idle' })
        clearStatusTimerRef.current = null
      }, 6000)
    }
    return () => {
      if (clearStatusTimerRef.current != null) {
        window.clearTimeout(clearStatusTimerRef.current)
        clearStatusTimerRef.current = null
      }
    }
  }, [lastMessageKey, status])

  // Hard timeout, timer-driven so it fires even when the readiness request
  // itself hangs (a data-driven timeout would need a refetch to observe).
  useEffect(() => {
    if (pollingKey == null) return
    const id = window.setTimeout(() => stopRun(pollingKey, { kind: 'timeout' }), REFRESH_TIMEOUT_MS)
    return () => window.clearTimeout(id)
  }, [pollingKey, stopRun])

  // Any HTTP error while polling (401/403/5xx/network) is terminal: the
  // signal is broken, so stop instead of spinning until the timeout.
  useEffect(() => {
    if (pollingKey == null || !readinessError) return
    stopRun(pollingKey, { kind: 'error', message: userFacingError(readinessError) })
  }, [readinessError, pollingKey, stopRun])

  // Scope change: when the page's active env/group moves to a different
  // scope than the one being refreshed, tear that poll down — it belongs to
  // the previous scope, and its completion must not invalidate or surface
  // into the new scope.
  useEffect(() => {
    if (scopeKey == null || pollingKey == null || scopeKey === pollingKey) return
    stopRun(pollingKey, { kind: 'idle' })
  }, [scopeKey, pollingKey, stopRun])

  const trigger = useCallback(
    (envId: number, groupId: number) => {
      const key = pollKeyFor(envId, groupId)
      // Dedupe per scope: clicks for this scope while its refresh is in
      // flight are dropped (ref-based: synchronous, so this also holds for
      // same-tick double clicks where state is not yet flushed). Refreshes
      // for a DIFFERENT scope keep working.
      if (inFlightKeysRef.current.has(key)) return
      inFlightKeysRef.current.add(key)
      const token = (runSeqRef.current.get(key) ?? 0) + 1
      runSeqRef.current.set(key, token)
      // Cold start: drop the previous (terminated) run's cached readiness
      // reading so its settled state can't terminate this new run.
      queryClient.removeQueries({ queryKey: ['analytics-refresh-poll', envId, groupId] })
      setStatus({ kind: 'pending', message: 'Refreshing pipeline data…' })
      setTriggering(true)
      setPollingScope({ envId, groupId })
      // Ownership check: this trigger promise still governs only while its
      // run is in flight (key present) AND no newer run for this scope has
      // superseded it (token still current).
      const isRunOwner = () =>
        inFlightKeysRef.current.has(key) && runSeqRef.current.get(key) === token
      void api
        .triggerScopedRefresh(envId, groupId)
        .then((res) => {
          if (!isRunOwner()) return
          if (res.triggered || res.in_progress) {
            invalidateScope(queryClient, { envId, groupId })
          }
          // Accepted or already running: the bounded poll is now the single
          // owner of completion — trigger success never ends the run.
        })
        .catch((err: unknown) => {
          console.warn('Scoped refresh trigger failed:', err)
          if (!isRunOwner()) return
          stopRun(key, { kind: 'error', message: userFacingError(err) })
        })
    },
    [queryClient, stopRun],
  )

  return useMemo(
    () => ({
      triggering,
      status,
      isRefreshing: triggering,
      isPolling: pollingKey != null,
      isPollSettled: isSettled(readinessData) && pollingKey != null,
      trigger,
    }),
    [triggering, status, pollingKey, readinessData, trigger],
  )
}

/**
 * Convenience export for callers that only need to fire a scoped refresh.
 * Prefer the full {@link useScopedRefresh} so the Refresh button's
 * loading/disabled state is bound to the single owned lifecycle instead of
 * the raw (unguaranteed) readiness signal.
 */
export function useScopedRefreshTrigger() {
  return useScopedRefresh().trigger
}
