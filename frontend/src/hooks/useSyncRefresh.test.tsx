import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

type RefreshResponse = { triggered: boolean; in_progress: boolean; message: string }

// The single trigger spy. Every test points its response at this via
// `refreshDeferred.mock*`. Default (pre-impl): a never-settling promise keeps
// an in-flight trigger deduped unless a test resolves it explicitly.
const refreshDeferred = vi.fn(
  (_envId: number, _groupId: number) => new Promise<never>(() => {}),
)

vi.mock('../services/api', () => {
  const api: Record<string, unknown> = {
    getAnalyticsReadiness: vi.fn(),
    getAnalyticsSummary: vi.fn(),
  }
  // Expose `refreshDeferred` as `api.triggerScopedRefresh` so callers hit the
  // real spy. The getter (not an eager value) keeps `refreshDeferred` out of
  // the module-init TDZ, since this factory is hoisted above the const above.
  // Both the `useScopedRefreshTrigger` block (asserts on `refreshDeferred`)
  // and the `useScopedRefresh` block (asserts on `api.triggerScopedRefresh`)
  // therefore observe the same underlying spy and its call records.
  Object.defineProperty(api, 'triggerScopedRefresh', {
    get: () => refreshDeferred,
    configurable: true,
  })
  return { api }
})

import { useSyncRefresh, useScopedRefresh, useScopedRefreshTrigger } from './useSyncRefresh'
import { api } from '../services/api'
import type { AnalyticsReadiness, AnalyticsSummary } from '../types'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/**
 * testing-library's `waitFor` auto-advances fake timers only when the global
 * `jest` is present (it detects sinon's `setTimeout.clock` and delegates
 * driving to `jest.advanceTimersByTime`). vitest installs sinon-based fake
 * timers but exposes no global `jest`, so `waitFor` falls back to a real-time
 * interval that never advances the frozen clock — react-query schedules fetch
 * and state updates via `setTimeout`, so the assertion stalls forever.
 * These helpers expose a minimal `jest` shim (and the `clock` marker) only
 * while fake timers are active, so `waitFor` can drive the clock.
 */
function enableJestTimerBridge() {
  ;(setTimeout as unknown as { clock?: unknown }).clock = {}
  ;(globalThis as Record<string, unknown>).jest = {
    advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
  }
}
function disableJestTimerBridge() {
  delete (setTimeout as unknown as { clock?: unknown }).clock
  delete (globalThis as Record<string, unknown>).jest
}

const READY_EMPTY: AnalyticsReadiness = {
  ready: true,
  data_available: false,
  message: '',
  last_completed_at: '2026-08-12T10:01:00Z',
  project_count: 5,
  pipeline_count: 100,
  runner_state_count: 5,
  user_count: 5,
  user_event_count: 50,
  user_issue_count: 23,
}

const NOT_READY: AnalyticsReadiness = {
  ready: false,
  data_available: false,
  message: 'Collecting analytics data...',
  last_completed_at: null,
  project_count: 0,
  pipeline_count: 0,
  runner_state_count: 0,
  user_count: 0,
  user_event_count: 0,
  user_issue_count: 0,
}

function summary(projectCount: number): AnalyticsSummary {
  return {
    window_days: 1,
    window_hours: 24,
    project_count: projectCount,
    pipeline_count: 0,
    success_count: 0,
    failed_count: 0,
    manual_count: 0,
    active_count: 0,
    canceled_count: 0,
    runner_count: 0,
    runner_running_count: 0,
    runner_idle_count: 0,
    runner_offline_count: 0,
    history: [],
    success_rate: 0,
  }
}

/**
 * Dataset observer shaped like the page queries: the cache key is prefixed
 * with the active environment and group so a result cached for one scope is
 * never served to another.
 */
function SummaryProbe({ envId, groupId }: { envId: number; groupId: number }) {
  useSyncRefresh({ envId, groupId })
  const { data } = useQuery({
    queryKey: ['analytics-summary', envId, groupId, 24],
    queryFn: () => api.getAnalyticsSummary(groupId, 24, 'latest'),
    staleTime: 0,
  })
  return <div data-testid="probe">{data ? `projects:${data.project_count}` : 'loading'}</div>
}

/** Renders the probe for a scope held in state so the selection can switch. */
function Harness() {
  const [scope, setScope] = useState({ envId: 1, groupId: 42 })
  return (
    <div>
      <SummaryProbe envId={scope.envId} groupId={scope.groupId} />
      <button type="button" onClick={() => setScope({ envId: 1, groupId: 43 })}>
        switch group
      </button>
    </div>
  )
}

function renderHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  )
}

describe('useSyncRefresh', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('refetches scoped datasets without a page refresh when a sync cycle completes', async () => {
    // First readiness call: sync still running → keeps polling at the shared
    // interval. Second call: a completed cycle → the datasets must be
    // invalidated and refetched by the active observer.
    vi.mocked(api.getAnalyticsReadiness)
      .mockResolvedValueOnce(NOT_READY)
      .mockResolvedValue(READY_EMPTY)
    vi.mocked(api.getAnalyticsSummary)
      .mockResolvedValueOnce(summary(1))
      .mockResolvedValue(summary(2))

    renderHarness()

    // Initial render loads the dataset and the not-ready signal.
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('projects:1'))
    expect(api.getAnalyticsSummary).toHaveBeenCalledTimes(1)

    // The poll lands the completed cycle; the dataset refetches without any
    // page refresh (the 5s interval drives the readiness re-fetch).
    await waitFor(() => expect(api.getAnalyticsReadiness).toHaveBeenCalledTimes(2), {
      timeout: 10000,
    })
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('projects:2'), {
      timeout: 10000,
    })
    expect(api.getAnalyticsSummary).toHaveBeenCalledTimes(2)
  }, 15000)

  it('invalidates and refetches scoped caches when the group selection moves', async () => {
    vi.mocked(api.getAnalyticsReadiness).mockResolvedValue(READY_EMPTY)
    vi.mocked(api.getAnalyticsSummary)
      .mockResolvedValueOnce(summary(1))
      .mockResolvedValue(summary(2))

    renderHarness()
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('projects:1'))

    // Switch to a different group: the cached result of the old scope must
    // not be served; the new scope's dataset must load immediately.
    fireEvent.click(screen.getByRole('button', { name: 'switch group' }))
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('projects:2'))
    expect(api.getAnalyticsSummary).toHaveBeenCalledTimes(2)
    expect(api.getAnalyticsReadiness).toHaveBeenCalledTimes(2)
  }, 10000)
})

describe('useScopedRefreshTrigger', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    refreshDeferred.mockReset()
  })

  afterEach(() => {
    // Ensure no deferred promise lingers between tests.
    refreshDeferred.mockReset()
  })

  it('triggers only once for the same scope when repeated while in flight, and refetches the scope dataset on acceptance', async () => {
    const first = deferred<RefreshResponse>()
    const second = deferred<RefreshResponse>()
    refreshDeferred.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    vi.mocked(api.getAnalyticsSummary)
      .mockResolvedValueOnce(summary(1))
      .mockResolvedValue(summary(2))

    let trigger!: (envId: number, groupId: number) => void
    const TriggerHost = () => {
      trigger = useScopedRefreshTrigger()
      const { data } = useQuery({
        queryKey: ['analytics-summary', 1, 42, 24],
        queryFn: () => api.getAnalyticsSummary(42, 24, 'latest'),
        staleTime: 0,
      })
      return <div data-testid="probe">{data ? `projects:${data.project_count}` : 'loading'}</div>
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <TriggerHost />
      </QueryClientProvider>,
    )

    // Initial dataset lands before any refresh.
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('projects:1'))
    // Visible data is preserved while the refresh round-trip is still pending.
    expect(screen.getByTestId('probe')).toHaveTextContent('projects:1')

    // Two rapid clicks / double-mounted callers for the same scope.
    trigger(1, 42)
    trigger(1, 42)
    // Only one API call was issued — the duplicate is dropped while in flight.
    expect(refreshDeferred).toHaveBeenCalledTimes(1)
    expect(refreshDeferred).toHaveBeenCalledWith(1, 42)

    // The trigger response has not resolved yet: no refetch.
    expect(api.getAnalyticsSummary).toHaveBeenCalledTimes(1)

    // Release the first response; the hook must invalidate ONLY this scope.
    first.resolve({ triggered: true, in_progress: false, message: 'accepted' })
    // Release the second (never-called) for hygiene.
    second.resolve({ triggered: false, in_progress: false, message: 'n/a' })

    // The scope dataset refetches and lands fresh data.
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('projects:2'))
    expect(api.getAnalyticsSummary).toHaveBeenCalledTimes(2)

    // A different scope's cached data is untouched (no stale-scope update).
    const cachedOtherScope = await queryClient.getQueryData<{ project_count: number }>(
      ['analytics-summary', 1, 99, 24],
    )
    expect(cachedOtherScope).toBeUndefined()
  }, 10000)

  it('dedupes by scoped env+group so a stale scope switch does not drop the new scope’s trigger', async () => {
    const a = deferred<RefreshResponse>()
    const b = deferred<RefreshResponse>()
    refreshDeferred
      .mockReturnValueOnce(a.promise)
      .mockReturnValueOnce(b.promise)
      .mockReturnValueOnce(Promise.resolve({ triggered: true, in_progress: false, message: 'accepted' }))

    let trigger!: (envId: number, groupId: number) => void
    const TriggerHost = () => {
      trigger = useScopedRefreshTrigger()
      return <div>ok</div>
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <TriggerHost />
      </QueryClientProvider>,
    )

    // Scope A in flight.
    trigger(1, 42)
    expect(refreshDeferred).toHaveBeenCalledTimes(1)
    // Scope B is a distinct scope; its trigger must NOT be dropped even though
    // scope A's request is still in flight.
    trigger(1, 43)
    expect(refreshDeferred).toHaveBeenCalledTimes(2)
    expect(refreshDeferred).toHaveBeenLastCalledWith(1, 43)

    // Repeat scope A while it is still in flight → dropped.
    trigger(1, 42)
    expect(refreshDeferred).toHaveBeenCalledTimes(2)

    a.resolve({ triggered: true, in_progress: false, message: 'accepted' })
    b.resolve({ triggered: true, in_progress: false, message: 'accepted' })
  }, 10000)
})

describe('useScopedRefresh (Refresh lifecycle owner)', () => {
  const SCOPED_RUNNING: AnalyticsReadiness = { ...NOT_READY, scoped_syncing: true }
  const SCOPED_SETTLED: AnalyticsReadiness = { ...READY_EMPTY, scoped_syncing: false }
  const SCOPED_FAILED: AnalyticsReadiness = {
    ...READY_EMPTY,
    scoped_syncing: false,
    scoped_error: 'upstream GitLab returned 5xx',
  }

  function renderHarness(
    scope: { envId?: number; groupId?: number | null },
  ) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    const hookState: {
      current: ReturnType<typeof useScopedRefresh> | null
    } = { current: null }
    const group = scope.groupId ?? null

    function Host() {
      hookState.current = useScopedRefresh({
        envId: scope.envId,
        groupId: group === null ? undefined : group,
      })
      const { data } = useQuery({
        queryKey: ['analytics-summary', scope.envId, group, 24],
        queryFn: () => api.getAnalyticsSummary(group as number, 24, 'latest'),
        enabled: group !== null,
        staleTime: 0,
      })
      return (
        <div data-testid="probe">
          {data ? `projects:${data.project_count}` : 'loading'}
        </div>
      )
    }

    const view = render(
      <QueryClientProvider client={queryClient}>
        <Host />
      </QueryClientProvider>,
    )
    return { queryClient, hookState, ...view }
  }

  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    refreshDeferred.mockReset()
    vi.useFakeTimers()
    enableJestTimerBridge()
  })

  afterEach(() => {
    refreshDeferred.mockReset()
    vi.useRealTimers()
    cleanup()
    disableJestTimerBridge()
  })

  it('owns the lifecycle: triggers once, polls, settles on completed, refetches the scope dataset', async () => {
    refreshDeferred.mockResolvedValue({ triggered: false, in_progress: false, message: 'n/a' })
    // Poll readings: running → running → settled(completed).
    vi.mocked(api.getAnalyticsReadiness)
      .mockResolvedValueOnce(SCOPED_RUNNING)
      .mockResolvedValueOnce(SCOPED_RUNNING)
      .mockResolvedValue(SCOPED_SETTLED)
    vi.mocked(api.getAnalyticsSummary)
      .mockResolvedValueOnce(summary(1)) // initial dataset
      .mockResolvedValueOnce(summary(2)) // completion invalidation

    const { hookState } = renderHarness({ envId: 1, groupId: 42 })

    // Initial render: dataset loaded, hook idle.
    await waitFor(
      () => expect(screen.getByTestId('probe')).toHaveTextContent('projects:1'),
      { timeout: 3000 },
    )
    await waitFor(
      () => expect(hookState.current?.isRefreshing).toBe(false),
      { timeout: 3000 },
    )
    expect(api.triggerScopedRefresh as ReturnType<typeof vi.fn>).not.toHaveBeenCalled()

    // Click Refresh → the hook goes refreshing and fires the trigger once.
    hookState.current!.trigger(1, 42)
    expect(api.getAnalyticsSummary).toHaveBeenCalledTimes(1)
    await waitFor(
      () => expect(hookState.current).toMatchObject({ isRefreshing: true, isPolling: true }),
      { timeout: 3000 },
    )
    // Existing data stays visible while the refresh is in flight.
    expect(screen.getByTestId('probe')).toHaveTextContent('projects:1')
    expect(api.triggerScopedRefresh as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1)

    const triggerCalls = vi.mocked(api.getAnalyticsReadiness).mock.calls.length
    // Bounded poll: the first refetch lands after one poll interval
    // (READINESS_POLL_MS) — the initial trigger fetch already counts above.
    await vi.advanceTimersByTimeAsync(5000)
    expect(vi.mocked(api.getAnalyticsReadiness).mock.calls.length).toBeGreaterThan(triggerCalls)

    // Next reading still running → keep polling.
    await vi.advanceTimersByTimeAsync(5000)
    // Settled reading → terminate: data refetched, spinner cleared.
    await vi.advanceTimersByTimeAsync(5000)

    await waitFor(
      () => expect(hookState.current).toMatchObject({ isRefreshing: false, isPolling: false }),
      { timeout: 3000 },
    )
    await waitFor(
      () => expect(screen.getByTestId('probe')).toHaveTextContent('projects:2'),
      { timeout: 3000 },
    )
    expect(api.getAnalyticsSummary).toHaveBeenCalledTimes(2)
    expect(hookState.current?.status.kind).toBe('success')

    // No further polling after the terminal state, even given lots of time.
    const settleCalls = vi.mocked(api.getAnalyticsReadiness).mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(vi.mocked(api.getAnalyticsReadiness).mock.calls.length).toBe(settleCalls)
  }, 20000)

  it('dedupes duplicate clicks during an in-flight refresh', async () => {
    // Trigger never resolves; readiness never reports running, so the run
    // stays in flight.
    refreshDeferred.mockReturnValue(new Promise<never>(() => {}))
    vi.mocked(api.getAnalyticsReadiness).mockResolvedValue(SCOPED_RUNNING)

    const { hookState } = renderHarness({ envId: 1, groupId: 42 })
    await waitFor(
      () => expect(hookState.current).not.toBeNull(),
      { timeout: 3000 },
    )
    hookState.current!.trigger(1, 42)
    await waitFor(
      () => expect(hookState.current?.isRefreshing).toBe(true),
      { timeout: 3000 },
    )
    // Rapid double-clicks in the same tick: the guard drops them.
    hookState.current!.trigger(1, 42)
    hookState.current!.trigger(1, 42)
    expect(api.triggerScopedRefresh as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1)

    // A different scope is a distinct run and is not blocked.
    hookState.current!.trigger(1, 43)
    expect(api.triggerScopedRefresh as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2)
    expect(api.triggerScopedRefresh as ReturnType<typeof vi.fn>).toHaveBeenLastCalledWith(1, 43)
  }, 15000)

  it('stops and clears via timeout so a stale not-ready backend cannot spin forever', async () => {
    refreshDeferred.mockResolvedValue({ triggered: true, in_progress: false, message: 'accepted' })
    // The backend stays not-syncing (the stale-state case): the poll's own
    // readings must terminate the run on the hard timeout, not on ready.
    vi.mocked(api.getAnalyticsReadiness).mockResolvedValue(SCOPED_RUNNING)

    const { hookState } = renderHarness({ envId: 1, groupId: 42 })
    await waitFor(
      () => expect(hookState.current).not.toBeNull(),
      { timeout: 3000 },
    )
    hookState.current!.trigger(1, 42)
    await waitFor(
      () => expect(hookState.current).toMatchObject({ isRefreshing: true, isPolling: true }),
      { timeout: 3000 },
    )

    await vi.advanceTimersByTimeAsync(30_000)
    await waitFor(
      () =>
        expect(hookState.current).toMatchObject({ isRefreshing: false, isPolling: false, status: { kind: 'timeout' } }),
      { timeout: 3000 },
    )
    // Guard is clear: a subsequent Refresh starts a fresh run.
    hookState.current!.trigger(1, 42)
    await waitFor(
      () => expect(hookState.current?.isRefreshing).toBe(true),
      { timeout: 3000 },
    )
    expect(api.triggerScopedRefresh as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2)
  }, 20000)

  it('tears down the in-flight poll when the active scope changes', async () => {
    refreshDeferred.mockResolvedValue({ triggered: true, in_progress: false, message: 'accepted' })
    // The backend for the OLD scope would still be running; the poll must be
    // torn down the instant the page scope moves, not left spinning.
    const readinessCalls: number[] = []
    vi.mocked(api.getAnalyticsReadiness).mockImplementation(async (g: number) => {
      readinessCalls.push(g)
      return SCOPED_RUNNING
    })
    vi.mocked(api.getAnalyticsSummary).mockResolvedValue(summary(1))

    function Host() {
      const [group, setGroup] = useState(42)
      const ref = useScopedRefresh({ envId: 1, groupId: group })
      hookState.current = ref
      return (
        <div>
          <button type="button" onClick={() => setGroup(43)} data-testid="switch">
            switch
          </button>
        </div>
      )
    }
    const hookState: { current: ReturnType<typeof useScopedRefresh> | null } = { current: null }
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <Host />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(hookState.current).not.toBeNull(), { timeout: 3000 })
    hookState.current!.trigger(1, 42)
    await waitFor(
      () => expect(hookState.current).toMatchObject({ isRefreshing: true, isPolling: true }),
      { timeout: 3000 },
    )

    fireEvent.click(screen.getByTestId('switch'))
    await waitFor(
      () => expect(hookState.current).toMatchObject({ isRefreshing: false, isPolling: false }),
      { timeout: 3000 },
    )

    // No further poll requests for the old scope after the switch.
    const callsAfterSwitch = [...readinessCalls]
    await vi.advanceTimersByTimeAsync(60_000)
    expect(readinessCalls).toEqual(callsAfterSwitch)

    // The new scope's trigger is not blocked by the torn-down old run.
    hookState.current!.trigger(1, 43)
    await waitFor(
      () => expect(hookState.current?.isRefreshing).toBe(true),
      { timeout: 3000 },
    )
    expect(api.triggerScopedRefresh as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(2)
  }, 20000)

  it('surfaces a scoped settle-with-error as a terminal error and still invalidates the scope', async () => {
    refreshDeferred.mockResolvedValue({ triggered: false, in_progress: false, message: 'accepted' })
    vi.mocked(api.getAnalyticsReadiness)
      .mockResolvedValueOnce(SCOPED_RUNNING)
      .mockResolvedValue(SCOPED_FAILED)
    vi.mocked(api.getAnalyticsSummary)
      .mockResolvedValueOnce(summary(1))
      .mockResolvedValueOnce(summary(2))

    const { hookState } = renderHarness({ envId: 1, groupId: 42 })
    await waitFor(
      () => expect(screen.getByTestId('probe')).toHaveTextContent('projects:1'),
      { timeout: 3000 },
    )
    hookState.current!.trigger(1, 42)
    await waitFor(
      () => expect(hookState.current?.isRefreshing).toBe(true),
      { timeout: 3000 },
    )
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(5000)
    await waitFor(
      () => expect(hookState.current).toMatchObject({ isRefreshing: false, isPolling: false }),
      { timeout: 3000 },
    )
    expect(hookState.current?.status).toEqual({
      kind: 'error',
      message: 'upstream GitLab returned 5xx',
    })
    // Failed settle still invalidates so the page refetches (and can show its
    // own error state) — existing rows stay visible until the refetch lands.
    await waitFor(
      () => expect(api.getAnalyticsSummary).toHaveBeenCalledTimes(2),
      { timeout: 3000 },
    )
  }, 20000)
})
