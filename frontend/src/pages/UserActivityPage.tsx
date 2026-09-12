import { useState, useMemo, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Tooltip, Button } from 'antd'
import { TeamOutlined, ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons'
import type { UserActivity, AnalyticsReadiness } from '../types'
import { useGroupContext } from '../contexts/GroupContext'
import { TIME_RANGES, formatTimeRangeLabel, formatRelative } from '../utils/timeRanges'
import { api } from '../services/api'
import TablePaginator from '../components/TablePaginator'
import FieldSearchBox, { type FieldSearchBoxFilterChip } from '../components/FieldSearchBox'
import AnalyticsLoadingGate, { datasetIsPending } from '../components/AnalyticsLoadingGate'
import { useConfig } from '../hooks/useConfig'
import { usePageSizeOptions, calcTotalPages, useShowAllOption } from '../hooks/useAppConfig'
import '../styles/dashboard.css'

const LOCAL_STORAGE_RANGE_KEY = 'analytics_range_users'
const USER_ACTIVITY_PAGE_SIZE_KEY = 'gitlab_ops_user_activity_page_size'

function getDefaultHours(): number {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_RANGE_KEY)
    if (stored) {
      const parsed = parseInt(stored, 10)
      if (!isNaN(parsed) && TIME_RANGES.some((r) => r.hours === parsed)) {
        return parsed
      }
    }
  } catch { /* ignore */ }
  return 24
}

// ── Summary Bar Segment ──────────────────────────────────────

interface SummaryMetric {
  key: string
  label: string
  value: number
  color: string
}

function SegmentBar({ items, total }: {
  items: SummaryMetric[]
  total: number
}) {
  const present = items.filter((item) => item.value > 0)
  return (
    <div
      className="summary-bar-segments"
      role="img"
      aria-label={present.map((item) => `${item.label.toLowerCase()} ${item.value}`).join(', ') || 'no data'}
    >
      {present.map((item) => {
        const pct = total ? Math.round((item.value / total) * 100) : 0
        return (
          <Tooltip key={item.key} title={`${item.label}: ${item.value} (${pct}%)`}>
            <span
              style={
                {
                  '--summary-color': item.color,
                  flexGrow: item.value || 0,
                  flexBasis: `${total ? (item.value / total) * 100 : 0}%`,
                } as React.CSSProperties
              }
            />
          </Tooltip>
        )
      })}
    </div>
  )
}

type UserMembership = 'active' | 'non-active' | 'both'
type UserSearchField = 'all' | 'state' | 'user' | 'activity'

const USER_SEARCH_FIELDS: { value: UserSearchField; label: string }[] = [
  { value: 'all', label: 'All fields' },
  { value: 'state', label: 'State' },
  { value: 'user', label: 'User' },
  { value: 'activity', label: 'Activity' },
]

const STATE_OPTIONS: { value: UserMembership; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'non-active', label: 'Non-active' },
  { value: 'both', label: 'Both' },
]

const ACTIVITY_COLORS: Record<string, string> = {
  pushes: '#047857',
  mrs: '#d97706',
  comments: '#1d4ed8',
  issues: '#dc2626',
}

const ACTIVITY_OPTIONS: { value: string; label: string; color?: string }[] = [
  { value: 'pushes', label: 'Pushes', color: ACTIVITY_COLORS.pushes },
  { value: 'mrs', label: 'MRs', color: ACTIVITY_COLORS.mrs },
  { value: 'comments', label: 'Comments', color: ACTIVITY_COLORS.comments },
  { value: 'issues', label: 'Issues', color: ACTIVITY_COLORS.issues },
]

interface UserSearchFilter { field: UserSearchField; value: string }

const stateLabel = (v: string) => STATE_OPTIONS.find((o) => o.value === v)?.label ?? v
const activityLabel = (v: string) => ACTIVITY_OPTIONS.find((o) => o.value === v)?.label ?? v

// When searching "all", infer which concrete field a suggestion belongs to.
function resolveSearchField(value: string): UserSearchField {
  if (STATE_OPTIONS.some((o) => o.value === value)) return 'state'
  if (ACTIVITY_OPTIONS.some((o) => o.value === value)) return 'activity'
  return 'user'
}
type UserSortKey = 'name' | 'username' | 'state' | 'badge' | 'issues' | 'mrs' | 'merged' | 'pushes' | 'comments' | 'last_activity'
type SortDirection = 'asc' | 'desc'

function getStoredPageSize(): number {
  const stored = Number(localStorage.getItem(USER_ACTIVITY_PAGE_SIZE_KEY))
  if (Number.isInteger(stored) && stored > 0) return stored
  return 10
}

export default function UserActivityPage() {
  const { selectedGroupId, selectedEnvId } = useGroupContext()
  const queryClient = useQueryClient()

  const [hours, setHoursState] = useState(getDefaultHours())
  const [selectedUserKeys, setSelectedUserKeys] = useState<Set<string>>(new Set())
  const [membershipFilter, setMembershipFilter] = useState<'active' | 'non-active' | 'both'>('both')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [sortKey, setSortKey] = useState<UserSortKey>('last_activity')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [refreshing, setRefreshing] = useState(false)

  /* ── Page size from app config ─────────────────────────────────────── */

  useConfig() /* preload global config used elsewhere on the page */
  const configPageSizeOptions = usePageSizeOptions()
  const showAllOption = useShowAllOption()

  const [searchField, setSearchField] = useState<UserSearchField>('all')
  const [searchFilters, setSearchFilters] = useState<UserSearchFilter[]>([])
  const [searchQuery, setSearchQuery] = useState<string>('')

  const groupIds = selectedGroupId ? [String(selectedGroupId)] : []
  const groupIdsCsv = groupIds.join(',')
  const userIdsParam = selectedUserKeys.size > 0
    ? [...selectedUserKeys].map(k => k.split(':')[0]).join('|')
    : undefined

interface PaginatedUserResponse {
  users: UserActivity[]
  page: number
  pageSize: number
  total: number
}

// Fetch users with server-side filters
const { data: usersResponse = { users: [], page: 1, pageSize: 10, total: 0 }, isLoading } = useQuery<PaginatedUserResponse>({
    queryKey: ['user-activity', selectedEnvId, groupIdsCsv, hours, membershipFilter, userIdsParam ?? '', searchQuery, page, pageSize, sortKey, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams({
        group_ids: groupIdsCsv,
        hours: String(hours),
        membership: membershipFilter,
        page: String(page),
        page_size: String(pageSize),
        sort_by: sortKey,
        sort_order: sortDirection,
      })
      if (userIdsParam) params.set('user_ids', userIdsParam)
      if (searchQuery) params.set('search', searchQuery)
      // Pass activity filter as a param so the backend can narrow the server-side results
      for (const f of searchFilters) {
        if (f.field === 'activity') {
          params.set('activity_type', f.value)
        }
      }
      const resp = await fetch(`/api/analytics/users?${params}`, {
        credentials: 'include',
      })
      if (!resp.ok) return { users: [], page: 1, pageSize: 10, total: 0 }
      return resp.json()
    },
    enabled: groupIds.length > 0,
  })

  const users = usersResponse?.users || []

  // Load the complete selector directory independently from the paginated table.
  const { data: selectableUsers = [] } = useQuery<UserActivity[]>({
    queryKey: ['user-activity-options', selectedEnvId, groupIdsCsv, hours, membershipFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        group_ids: groupIdsCsv,
        hours: String(hours),
        membership: membershipFilter,
      })
      const resp = await fetch(`/api/analytics/users/options?${params}`, {
        credentials: 'include',
      })
      if (!resp.ok) return []
      return resp.json()
    },
    enabled: groupIds.length > 0,
  })

  // Fetch metrics with same filters
  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['user-metrics', selectedEnvId, groupIdsCsv, hours, membershipFilter, userIdsParam ?? '', searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        group_ids: groupIdsCsv,
        hours: String(hours),
        membership: membershipFilter,
      })
      if (userIdsParam) params.set('user_ids', userIdsParam)
      if (searchQuery) params.set('search', searchQuery)
      const resp = await fetch(`/api/analytics/users/metrics?${params}`, {
        credentials: 'include',
      })
      if (!resp.ok) return null
      return resp.json()
    },
    enabled: groupIds.length > 0,
  })

  // Fetch readiness. This is a plain observer of the single shared readiness
  // signal: Shell's useSyncRefresh owns the one `refetchInterval` for endpoint
  // `/api/analytics/readiness` on the canonical key
  // `[analytics-readiness, envId, groupId]`. Opening a second query with its
  // own hardcoded `refetchInterval: 5000` here created two independent 5s
  // pollers of the same endpoint, which is what kept the banner alive. The
  // page reads the cached signal and never polls on its own.
  const { data: readinessData } = useQuery<AnalyticsReadiness>({
    queryKey: ['analytics-readiness', selectedEnvId, selectedGroupId],
    queryFn: () => api.getAnalyticsReadiness(selectedGroupId as number),
    enabled: groupIds.length > 0,
    staleTime: 10_000,
  })

  /* Completion → one refetch is owned by Shell's useSyncRefresh, which
     invalidates every scope-prefixed dataset query the moment `last_completed_at`
     (or `data_available`) changes on this canonical key — so this page just
     observes the cached signal; adding its own refetch here would double-run
     the summary/table fetch and, combined with the previous `refetchInterval:
     5000`, was one of the two duplicate-poll paths behind the "always syncing"
     banner. */

  const toggleSort = useCallback((key: UserSortKey) => {
    if (sortKey === key) setSortDirection(current => current === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDirection('asc')
    }
    setPage(1)
  }, [sortKey])

  const sortIndicator = useCallback((key: UserSortKey) => {
    if (sortKey !== key) return '⇅'
    return sortDirection === 'asc' ? '↑' : '↓'
  }, [sortKey, sortDirection])

  // Preserve the server order, which is already sorted and paginated server-side.
  const sortedUsers = useMemo(() => {
    return [...users]
  }, [users])

  // Server-side pagination is already applied; use the raw result directly.
  const totalFromQuery = usersResponse?.total ?? 0
  const totalCount = totalFromQuery > 0 ? totalFromQuery : metricsData?.totalUsers ?? sortedUsers.length

  const pageCount = useMemo(() => calcTotalPages(totalCount, pageSize), [totalCount, pageSize])

  const pagedUsers = sortedUsers

  // User options for multi-select (include all matching users across pages)
  const userOptions = useMemo(() => {
    return [...selectableUsers].sort((a: UserActivity, b: UserActivity) =>
      (a.name || a.username).localeCompare(b.name || b.username)
    )
  }, [selectableUsers])

  /* ── Field-aware search box (shared FieldSearchBox component) ────────── */

  const searchSuggestions = useMemo<Record<string, { value: string; label: string; color?: string }[]>>(() => {
    const userSug = userOptions.map((u: UserActivity) => ({ value: String(u.id), label: `${u.name || u.username} (@${u.username})` }))
    return {
      all: [...STATE_OPTIONS.map((o) => ({ value: o.value, label: o.label })), ...userSug, ...ACTIVITY_OPTIONS],
      state: STATE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
      user: userSug,
      activity: ACTIVITY_OPTIONS,
    }
  }, [userOptions])

  const chips = useMemo<FieldSearchBoxFilterChip[]>(() => {
    const list: FieldSearchBoxFilterChip[] = []
    if (membershipFilter !== 'both') {
      list.push({ key: `state::${membershipFilter}`, field: 'state', fieldLabel: 'State', valueLabel: stateLabel(membershipFilter) })
    }
    if (searchQuery) {
      list.push({ key: `search::${searchQuery}`, field: 'user', fieldLabel: 'User', valueLabel: searchQuery })
    }
    selectedUserKeys.forEach((key) => {
      const userId = key.split(':')[0]
      const u = userOptions.find((x: UserActivity) => String(x.id) === userId)
      list.push({ key: `user::${userId}`, field: 'user', fieldLabel: 'User', valueLabel: u ? (u.name || u.username) : userId })
    })
    searchFilters.forEach((f) => {
      list.push({ key: `activity::${f.value}`, field: 'activity', fieldLabel: 'Activity', valueLabel: activityLabel(f.value), color: ACTIVITY_COLORS[f.value] })
    })
    return list
  }, [membershipFilter, searchQuery, selectedUserKeys, userOptions, searchFilters])

  const pickSuggestion = useCallback((field: string, s: { value: string; label: string }) => {
    const effField: UserSearchField = field === 'all' ? resolveSearchField(s.value) : (field as UserSearchField)
    if (effField === 'state') setMembershipFilter(s.value as UserMembership)
    else if (effField === 'user') {
      const entry = `${s.value}:`
      setSelectedUserKeys(prev => new Set([...prev, entry]))
      setPage(1)
    }
    else setSearchFilters((prev) => prev.some((f) => f.field === 'activity' && f.value === s.value)
      ? prev : [...prev, { field: 'activity' as const, value: s.value }])
  }, [])

  const pickFreeText = useCallback((field: string, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (field === 'user' || field === 'all') {
      setSearchQuery(trimmed)
      setPage(1)
      return
    }
    if (field === 'activity') {
      setSearchFilters((prev) => prev.some((f) => f.field === 'activity' && f.value === trimmed)
        ? prev : [...prev, { field: 'activity' as const, value: trimmed }])
    }
    setPage(1)
  }, [])

  const removeChip = useCallback((index: number) => {
    const c = chips[index]
    if (!c) return
    if (c.key.startsWith('search::')) {
      setSearchQuery('')
    } else if (c.field === 'state') {
      setMembershipFilter('both')
    } else if (c.field === 'user') {
      const id = c.key.split('::')[1]
      setSelectedUserKeys(prev => {
        const next = new Set(prev)
        for (const k of next) {
          if (k.startsWith(`${id}:`)) {
            next.delete(k)
          }
        }
        return next
      })
    } else {
      const id = c.key.split('::')[1]
      setSearchFilters(searchFilters.filter((f) => f.value !== id))
    }
    setPage(1)
  }, [chips, searchFilters])

  const clearAllFilters = useCallback(() => {
    setMembershipFilter('both')
    setSelectedUserKeys(new Set())
    setSearchFilters([])
    setSearchQuery('')
    setPage(1)
  }, [])

  // Handlers
  const onRangeChange = useCallback((value: number) => {
    setHoursState(value)
    try { localStorage.setItem(LOCAL_STORAGE_RANGE_KEY, String(value)) } catch { /* ignore */ }
    setPage(1)
  }, [])

  const refresh = useCallback(() => {
    setRefreshing(true)
    const params = new URLSearchParams({ group_ids: groupIdsCsv, hours: String(hours), refresh: 'true' })
    let headers: Record<string, string> = {}
    try {
      const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/)
      if (match) {
        headers['X-CSRF-TOKEN'] = decodeURIComponent(match[1])
      }
    } catch { /* ignore */ }
    fetch(`/api/analytics/users?${params}`, { method: 'POST', credentials: 'include', headers }).catch(() => {})
      .finally(() => {
        setRefreshing(false)
        void queryClient.invalidateQueries({ queryKey: ['user-activity', selectedEnvId, groupIdsCsv, hours] })
        void queryClient.invalidateQueries({ queryKey: ['user-metrics', selectedEnvId, groupIdsCsv, hours] })
        void queryClient.invalidateQueries({ queryKey: ['analytics-readiness', selectedEnvId, selectedGroupId] })
      })
  }, [groupIdsCsv, hours, selectedEnvId, selectedGroupId, queryClient])

  const exportCsv = useCallback(() => {
    const params = new URLSearchParams({
      group_ids: groupIdsCsv,
      hours: String(hours),
      membership: membershipFilter,
    })
    if (userIdsParam) params.set('user_ids', userIdsParam)
    if (searchQuery) params.set('search', searchQuery)
    const range = formatTimeRangeLabel(hours).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const url = `/api/analytics/users/export?${params}&filename_prefix=user-activity-${range}`

    const a = document.createElement('a')
    a.href = url
    a.click()
  }, [groupIdsCsv, hours, membershipFilter, userIdsParam, searchQuery])

  const activityMetrics: SummaryMetric[] = [
    { key: 'pushes', label: 'Pushes', value: metricsData?.totalPushes ?? 0, color: ACTIVITY_COLORS.pushes },
    { key: 'merge-requests', label: 'MRs', value: metricsData?.totalMergeRequests ?? 0, color: ACTIVITY_COLORS.mrs },
    { key: 'merged', label: 'Merged', value: metricsData?.totalMergedUsers ?? 0, color: '#c2410c' },
    { key: 'comments', label: 'Comments', value: metricsData?.totalComments ?? 0, color: ACTIVITY_COLORS.comments },
    { key: 'issues', label: 'Issues', value: metricsData?.totalIssues ?? 0, color: ACTIVITY_COLORS.issues },
  ]
  const activityTotal = activityMetrics.reduce((sum, metric) => sum + metric.value, 0)

  return (
    <div className="user-metrics-page">
      {readinessData?.scoped_error && (
        <section className="analytics-waiting-notice analytics-waiting-notice--error" role="alert">
          <span aria-hidden>!</span>
          <span>{readinessData.scoped_error}</span>
        </section>
      )}
      {/* Summary bar */}
      <section className="summary-bar user-activity-summary">
        <div className="summary-bar-title">
          <TeamOutlined aria-hidden className="page-header-icon" />
          <div className="page-header-copy">
            <span>USER ACTIVITY</span>
            <small>current and historical contributors</small>
          </div>
        </div>
        <SegmentBar items={activityMetrics} total={activityTotal} />
      </section>

      {/* Data Workspace */}
      <div className="data-workspace" style={{ marginTop: '0' }}>
        {/* Toolbar */}
        <div className="user-metrics-toolbar workspace-toolbar flex justify-between">
          <FieldSearchBox
            fields={USER_SEARCH_FIELDS}
            selectedField={searchField}
            onFieldChange={(f) => setSearchField(f as UserSearchField)}
            suggestions={searchSuggestions}
            filters={chips}
            onRemoveFilter={removeChip}
            onClearAll={clearAllFilters}
            onPickSuggestion={pickSuggestion}
            onPickFreeText={pickFreeText}
            ariaSearchLabel="Search users"
            listboxId="user-search-listbox"
            style={{ flex: '0 1 420px', minWidth: 260 }}
          />

          {/* Actions */}
          <div className="user-metrics-actions">
            <div className="time-range-control">
              <span className="range-caption">Range</span>
              <select
                className="native-range-select"
                value={hours}
                onChange={(e) => onRangeChange(Number(e.target.value))}
              >
                {TIME_RANGES.map((r) => (
                  <option key={r.hours} value={r.hours}>{r.label}</option>
                ))}
              </select>
            </div>
            <Button
              className="user-refresh-button"
              icon={<ReloadOutlined />}
              loading={refreshing}
              onClick={refresh}
            >
              Refresh
            </Button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={sortedUsers.length === 0}
              className="toolbar-action-btn"
            >
              {'\u21E9'} Export CSV
            </button>
          </div>
        </div>

        <AnalyticsLoadingGate active={groupIds.length > 0 && datasetIsPending(readinessData, 'users', isLoading || metricsLoading)} className="analytics-loading-gate--full">
          {sortedUsers.length === 0 ? (
            <div className="pipelines-empty">
              <InfoCircleOutlined />
              <strong>No user activity data available</strong>
              <p>{users.length === 0 ? 'No users have been synced yet.' : 'No users match your filters.'}</p>
            </div>
          ) : (
            <div className="user-activity-table-wrapper">
              <table className="app-data-table scrolling-table user-metrics-table gitops-data-table">
              <thead>
                <tr>
                  {([
                    ['name', 'Name', 200, 'left', false],
                    ['username', 'Username', 150, 'left', false],
                    ['state', 'State', 120, 'center', true],
                    ['last_activity', 'Last activity', 210, 'left', false],
                    ['pushes', 'Pushes', 120, 'center', true],
                    ['mrs', 'MRs', 120, 'center', true],
                    ['merged', 'Merged', 120, 'center', true],
                    ['comments', 'Comments', 130, 'center', true],
                    ['issues', 'Issues', 120, 'center', true],
                  ] as const).map(([key, label, width, align, centered]) => (
                    <th key={key} style={{ width, textAlign: align }}>
                      <button
                        type="button"
                        className={`user-table-sort ${sortKey === key ? 'active' : ''} ${centered ? 'centered' : ''}`}
                        onClick={() => toggleSort(key)}
                        aria-label={`Sort by ${label} ${sortKey === key && sortDirection === 'asc' ? 'descending' : 'ascending'}`}
                      >
                        <span>{label}</span>
                        <span aria-hidden="true">{sortIndicator(key)}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedUsers.map((user: UserActivity) => (
                  <tr key={`${user.id}:${user.username}`}>
                    <td>
                      <span className="user-info">
                        {user.avatar_url && (
                          <img
                            src={user.avatar_url}
                            alt={user.username}
                            className="user-avatar"
                            title={user.name}
                          />
                        )}
                        <div className="user-details">
                          {user.web_url ? (
                            <a href={user.web_url} target="_blank" rel="noopener noreferrer">
                              {user.name || user.username}
                            </a>
                          ) : (
                            <span>{user.name || user.username}</span>
                          )}
                        </div>
                      </span>
                    </td>
                    <td className="username-cell">
                      {user.web_url ? (
                        <a href={user.web_url} target="_blank" rel="noopener noreferrer">
                          @{user.username}
                        </a>
                      ) : (
                        <span>@{user.username}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        className={`status-badge ${user.is_current_member ? 'status-active' : 'status-blocked'}`}
                      >
                        {user.is_current_member ? 'Active' : 'Non-active'}
                      </span>
                    </td>
                    <td>
                      {formatRelative(user.last_activity_on || user.last_pipeline_activity || '')}
                    </td>
                    <td style={{ textAlign: 'center' }} className="metric-value">{user.push_count}</td>
                    <td style={{ textAlign: 'center' }} className="metric-value">{user.merge_request_count}</td>
                    <td style={{ textAlign: 'center' }} className="metric-value">{user.merged_count}</td>
                    <td style={{ textAlign: 'center' }} className="metric-value">{user.comment_count}</td>
                    <td style={{ textAlign: 'center' }} className="metric-value">{user.issue_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Paginator */}
             <TablePaginator
               className="user-activity-paginator"
               current={page}
               totalPages={pageCount}
               pageSize={pageSize}
               pageSizes={configPageSizeOptions}
               showAllOption={showAllOption}
               pageSizeKey={USER_ACTIVITY_PAGE_SIZE_KEY}
               onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
               onPageChange={setPage}
            />
            </div>
          )}
        </AnalyticsLoadingGate>
      </div>
    </div>
  )
}
