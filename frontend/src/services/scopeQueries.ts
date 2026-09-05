import type { QueryClient } from '@tanstack/react-query'
import type { AnalyticsReadiness } from '../types'

/**
 * Query keys for the DB-backed analytics datasets that live behind the
 * backend sync. Every scope key is prefixed with the active environment id
 * and the selected group id(s) so that a cached result from one
 * environment/group can never be served to another one.
 */
export type Scope = { envId?: number; groupId?: number | string }

/** Prefixes (in declaration order) for the sync-backed dataset queries. */
export const SCOPE_QUERY_PREFIXES = [
  'pipeline-projects',
  'analytics-summary',
] as const

const SCOPE_PREFIX_SET = new Set<string>(SCOPE_QUERY_PREFIXES)

function keyMatchesScope(key: readonly unknown[], scope: Scope): boolean {
  if (!SCOPE_PREFIX_SET.has(String(key[0]))) return false
  const envId = key[1]
  const groupId = key[2]
  if (scope.envId !== undefined && envId !== scope.envId) return false
  if (scope.groupId !== undefined && String(groupId) !== String(scope.groupId)) return false
  return true
}

/** True when the key belongs to the sync-back datasets for this scope. */
export function isScopeKey(key: readonly unknown[], scope: Scope): boolean {
  return keyMatchesScope(key, scope)
}

function scopePredicate(scope: Scope) {
  return (query: { queryKey: readonly unknown[] }) => keyMatchesScope(query.queryKey, scope)
}

/**
 * Invalidate every sync-backed dataset cache entry for a given environment
 * and group. Invalidating marks the matching queries as stale, so the active
 * observer refetches immediately and other observers refresh on their next
 * mount/focus event. Readiness queries are deliberately excluded: they are
 * the polling signal, not a dataset, and invalidating them on a state change
 * would create a self-triggering loop.
 *
 * Prefer this shared utility over page-specific `invalidateQueries` calls —
 * it keeps the scope filter (env + group) consistent across pages so a
 * previously cached empty result is never reused by a different scope.
 */
export function invalidateScope(queryClient: QueryClient, scope: Scope) {
  for (const prefix of SCOPE_QUERY_PREFIXES) {
    void queryClient.invalidateQueries({
      queryKey: [prefix],
      predicate: scopePredicate(scope),
      refetchType: 'active',
    })
  }
}

/** Poll interval for the readiness signal while a sync is incomplete. */
export const READINESS_POLL_MS = 5_000

/**
 * True while a real scoped sync for this env+group is still running.
 *
 * - `scoped_syncing === true`  → the explicit in-progress signal from the
 *   backend's dedicated `refresh:{ns}:{group}` row.  Poll continues.
 * - `scoped_syncing === null`  → global (multi-group) call: fall back to
 *   `!ready` to keep the historical polling behaviour for the Pipelines page.
 * - `scoped_syncing === false` → settled (completed, failed, or stale).
 *   The backend has already resolved the 15-minute stale bound, so no
 *   further polling is needed regardless of the `ready` flag.
 *
 * `ready: false` alone (no scoped signal) is NOT treated as "syncing".
 */
export function readinessSyncInProgress(
  data: AnalyticsReadiness | null | undefined,
): boolean {
  if (!data) return false
  if (data.scoped_syncing === true) return true
  if (data.scoped_syncing == null) return !data.ready
  return false
}

/**
 * True once the backend finished the last sync cycle for this scope:
 * ready, not retrying/preparing, and no data expected in flight. While the
 * sync is incomplete the readiness signal must keep polling so the datasets
 * refetch the moment rows land in the database.
 */
export function readinessSettled(
  data: AnalyticsReadiness | null | undefined,
): boolean {
  return data !== undefined && data !== null && !readinessSyncInProgress(data)
}
