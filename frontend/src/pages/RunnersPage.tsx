import { useState, useMemo, useCallback } from 'react'
import { Button, Tag, Tooltip, Empty } from 'antd'
import { ThunderboltOutlined, ReloadOutlined, InfoCircleOutlined, WarningOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import TablePaginator from '../components/TablePaginator'
import FieldSearchBox, {
  type FieldSearchBoxFilterChip,
  type FieldSearchBoxSuggestion,
} from '../components/FieldSearchBox'
import { useGroupContext } from '../contexts/GroupContext'
import { api } from '../services/api'
import { useScopedRefresh } from '../hooks/useSyncRefresh'
import AnalyticsLoadingGate, { datasetIsPending } from '../components/AnalyticsLoadingGate'
import type { AnalyticsReadiness } from '../types'
import '../styles/dashboard.css'
import styles from '../styles/runners.module.css'

interface RunnerJob {
  id: number
  name: string
  stage: string
  status: string
  ref: string
  pipeline_id: number
  pipeline?: { id?: number; project_id?: number; ref?: string }
  web_url: string
}

interface Runner {
  id: number
  description: string
  paused: boolean
  is_shared: boolean
  online?: boolean
  runner_type: string
  status: string
  job_execution_status: string
  tag_list: string[]
  ip_address: string
  projects: { id: number; name: string; path_with_namespace: string }[]
  scope_name: string
  contacted_at?: string
}

interface RunnerWithJobs {
  group_id: number
  runner: Runner
  jobs: RunnerJob[]
}

const STATUS_COLORS: Record<string, string> = {
  running: 'var(--dashboard-info)',
  idle: '#18d99a',
  paused: '#ffc21c',
  online: '#18d99a',
  offline: '#ff5267',
  stale: '#8b9298',
}
const STATUS_ORDER = ['running', 'idle', 'online', 'offline', 'paused', 'stale']

type SearchField = 'all' | 'group' | 'runner' | 'ip' | 'job' | 'tag' | 'status'

const SEARCH_FIELDS: { value: SearchField; label: string }[] = [
  { value: 'all', label: 'All fields' },
  { value: 'status', label: 'Status' },
  { value: 'group', label: 'Group / Project' },
  { value: 'runner', label: 'Number' },
  { value: 'ip', label: 'IP Address' },
  { value: 'job', label: 'Job' },
  { value: 'tag', label: 'Tag' },
]

interface RunnerSearchFilter {
  field: SearchField
  value: string
}

function searchFieldsFor(field: SearchField, item: RunnerWithJobs): string[] {
  const { runner } = item
  const jobs = item.jobs
  const jobTexts = jobs.flatMap((j) => [j.name, j.stage, j.ref, String(j.pipeline_id)])
  switch (field) {
    case 'group':
      return [getRunnerScope(runner), ...runner.projects.flatMap((p) => [p.path_with_namespace, p.name])]
    case 'runner':
      return [String(runner.id), runner.description]
    case 'ip':
      return [runner.ip_address]
    case 'job':
      return jobTexts
    case 'tag':
      return runner.tag_list
    case 'status':
      return [getRunnerStatus(runner)]
    case 'all':
      return [
        getRunnerScope(runner),
        ...runner.projects.flatMap((p) => [p.path_with_namespace, p.name]),
        String(runner.id),
        runner.description,
        runner.ip_address,
        ...runner.tag_list,
        ...jobTexts,
      ]
  }
}

function itemMatchesFilterSet(item: RunnerWithJobs, filters: RunnerSearchFilter[]): boolean {
  const perField = new Map<SearchField, string[]>()
  for (const filter of filters) {
    const text = filter.value.trim().toLowerCase()
    if (!text) continue
    const existing = perField.get(filter.field)
    if (existing) existing.push(text)
    else perField.set(filter.field, [text])
  }
  for (const [field, texts] of perField) {
    const fieldValues = searchFieldsFor(field, item).map((v) => v.toLowerCase())
    if (!fieldValues.some((fv) => texts.some((t) => fv.includes(t)))) return false
  }
  return true
}

function getRunnerStatus(runner: Runner): string {
  if (runner.paused) return 'paused'
  if (runner.job_execution_status === 'running' || runner.job_execution_status === 'active') return 'running'
  if (runner.online && runner.job_execution_status === 'idle') return 'idle'
  return runner.status || (runner.online ? 'online' : 'offline')
}

function getRunnerScope(runner: Runner): string {
  if (runner.runner_type === 'project_type' && runner.projects.length > 0) {
    return runner.projects.map((p) => p.path_with_namespace || p.name).join(', ')
  }
  return runner.scope_name || '-'
}

function runnerType(type: string): string {
  return (type || 'unknown').replace(/_type$/, '').replace(/_/g, ' ')
}

function normalizeRunnerEntry(value: unknown): RunnerWithJobs | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  if (!item.runner || typeof item.runner !== 'object') return null
  const raw = item.runner as Record<string, unknown>
  const id = Number(raw.id)
  if (!Number.isFinite(id)) return null
  const projects = Array.isArray(raw.projects)
    ? raw.projects.filter(
        (project): project is Record<string, unknown> => Boolean(project) && typeof project === 'object'
      )
        .map((project) => ({
          id: Number(project.id) || 0,
          name: String(project.name ?? ''),
          path_with_namespace: String(project.path_with_namespace ?? ''),
        }))
    : []
  return {
    group_id: Number(item.group_id) || 0,
    runner: {
      id,
      description: String(raw.description ?? ''),
      paused: Boolean(raw.paused),
      is_shared: Boolean(raw.is_shared),
      online: Boolean(raw.online),
      runner_type: String(raw.runner_type ?? ''),
      status: String(raw.status ?? ''),
      job_execution_status: String(raw.job_execution_status ?? ''),
      tag_list: Array.isArray(raw.tag_list) ? raw.tag_list.map(String) : [],
      ip_address: String(raw.ip_address ?? ''),
      projects,
      scope_name: String(raw.scope_name ?? ''),
      contacted_at: raw.contacted_at == null ? undefined : String(raw.contacted_at),
    },
    jobs: Array.isArray(item.jobs) ? (item.jobs as RunnerJob[]) : [],
  }
}

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 100]
const RUNNERS_PAGE_SIZE_KEY = 'gitlab_ops_runners_page_size'

function getStoredPageSize(): number {
  const stored = Number(localStorage.getItem(RUNNERS_PAGE_SIZE_KEY))
  return PAGE_SIZE_OPTIONS.includes(stored) ? stored : 10
}

const STATUS_BADGE_CLASS = (status: string) =>
  status === 'running' || status === 'idle' || status === 'online'
    ? 'status-active'
    : status === 'paused'
      ? 'status-warning'
      : status === 'offline' || status === 'stale'
        ? 'status-blocked'
        : ''

export default function RunnersPage() {
  const { selectedGroupId, selectedEnvId, selectedEnvBaseUrl } = useGroupContext()
  const hasScope = selectedGroupId != null && selectedEnvId != null
  const selectedGroupIdValue = selectedGroupId || 0
  const hasGroups = selectedGroupIdValue > 0

  const { trigger: triggerScopedRefresh, isRefreshing: isRefreshingScoped } = useScopedRefresh({
    envId: selectedEnvId,
    groupId: selectedGroupIdValue || undefined,
  })

  const [searchField, setSearchField] = useState<SearchField>('all')
  const [searchFilters, setSearchFilters] = useState<RunnerSearchFilter[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(getStoredPageSize)

  const { data: readinessData } = useQuery<AnalyticsReadiness>({
    queryKey: ['analytics-readiness', selectedEnvId, selectedGroupIdValue],
    queryFn: () => api.getAnalyticsReadiness(selectedGroupIdValue),
    enabled: hasGroups,
    staleTime: 10_000,
  })

  const runnersQuery = useQuery({
    queryKey: ['runners', selectedEnvId, selectedGroupId],
    enabled: hasScope,
    queryFn: ({ signal }) => {
      if (selectedEnvId == null || selectedGroupId == null) return []
      const params = new URLSearchParams({
        group_id: String(selectedGroupId),
        environment_id: String(selectedEnvId),
      })
      return api.get<unknown[]>(`/api/runners?${params}`, { signal })
    },
    refetchInterval: 10_000,
    staleTime: 5_000,
  })

  const runners: RunnerWithJobs[] = useMemo(
    () => (runnersQuery.data ?? []).map(normalizeRunnerEntry).filter((item): item is RunnerWithJobs => item !== null),
    [runnersQuery.data],
  )

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of runners) {
      const s = getRunnerStatus(item.runner)
      counts[s] = (counts[s] || 0) + 1
    }
    return counts
  }, [runners])

  const filtered = useMemo(() => {
    const seen = new Set<number>()
    const result: RunnerWithJobs[] = []
    for (const item of runners) {
      if (!itemMatchesFilterSet(item, searchFilters)) continue
      const runnerId = item.runner.id
      if (seen.has(runnerId)) continue
      seen.add(runnerId)
      result.push(item)
    }
    return result
  }, [runners, searchFilters])

  const visibleStatuses = useMemo(
    () => STATUS_ORDER.filter((status) => (statusCounts[status] || 0) > 0),
    [statusCounts],
  )

  /* ── FieldSearchBox suggestion directory ─────────────────────────── */
  const searchSuggestions = useMemo<Record<string, FieldSearchBoxSuggestion[]>>(() => {
    const values = new Map<string, Set<string>>()
    for (const item of runners) {
      for (const sf of SEARCH_FIELDS) {
        if (!values.has(sf.value)) values.set(sf.value, new Set())
        for (const value of searchFieldsFor(sf.value, item)) {
          const trimmed = value.trim()
          if (trimmed && trimmed !== '-') values.get(sf.value)?.add(trimmed)
        }
      }
    }
    const result: Record<string, FieldSearchBoxSuggestion[]> = {}
    for (const [field, set] of values) {
      result[field] = [...set].sort((a, b) => a.localeCompare(b)).map((v) => {
        const color = field === 'status' ? STATUS_COLORS[v] : undefined
        return { value: v, label: v, color }
      })
    }
    return result
  }, [runners])

  const chips = useMemo<FieldSearchBoxFilterChip[]>(() =>
    searchFilters.map((f) => ({
      key: `${f.field}::${f.value}`,
      field: f.field,
      fieldLabel: SEARCH_FIELDS.find((x) => x.value === f.field)?.label ?? f.field,
      valueLabel: f.value,
      color: f.field === 'status' ? (STATUS_COLORS[f.value] || '#9AA3AD') : undefined,
    })),
    [searchFilters],
  )

  const pickSuggestion = useCallback((field: string, s: FieldSearchBoxSuggestion) => {
    setSearchFilters((prev) => {
      if (prev.some((f) => f.field === field && f.value.toLowerCase() === s.value.toLowerCase())) return prev
      return [...prev, { field: field as SearchField, value: s.value }]
    })
    setPage(1)
  }, [])

  const pickFreeText = useCallback((field: string, text: string) => {
    setSearchFilters((prev) => {
      if (prev.some((f) => f.field === field && f.value.toLowerCase() === text.toLowerCase())) return prev
      return [...prev, { field: field as SearchField, value: text }]
    })
    setPage(1)
  }, [])

  const removeFilterChip = useCallback((index: number) => {
    setSearchFilters((prev) => prev.filter((_, i) => i !== index))
    setPage(1)
  }, [])

  const clearAllFilters = useCallback(() => {
    setSearchFilters([])
    setPage(1)
  }, [])

  const pagedRunners = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  return (
    <div className="user-metrics-page">
      {readinessData?.scoped_error && (
        <section className="analytics-waiting-notice analytics-waiting-notice--error" role="alert">
          <span aria-hidden>!</span>
          <span>{readinessData.scoped_error}</span>
        </section>
      )}
      <section className="summary-bar user-activity-summary">
        <div className="summary-bar-title">
          <ThunderboltOutlined aria-hidden className="page-header-icon" />
          <div className="page-header-copy">
            <span>RUNNERS</span>
            <small>self-hosted runner inventory</small>
          </div>
        </div>
        <div className="summary-bar-segments">
          {visibleStatuses.map((status) => {
            const count = statusCounts[status] || 0
            const pct = runners.length ? Math.round((count / runners.length) * 100) : 0
            return (
              <Tooltip key={status} title={`${status}: ${count} (${pct}%)`}>
                <span
                  style={{
                    '--summary-color': STATUS_COLORS[status],
                    flexGrow: count || 0,
                    flexBasis: `${runners.length ? (count / runners.length) * 100 : 0}%`,
                  } as React.CSSProperties}
                />
              </Tooltip>
            )
          })}
        </div>
      </section>

      <div className="data-workspace" style={{ marginTop: '0' }}>
        <div className="user-metrics-toolbar workspace-toolbar flex justify-between">
          <FieldSearchBox
            className="runnersFilters"
            fields={SEARCH_FIELDS}
            selectedField={searchField}
            onFieldChange={(f) => { setSearchField(f as SearchField); setPage(1) }}
            suggestions={searchSuggestions}
            filters={chips}
            onRemoveFilter={removeFilterChip}
            onClearAll={clearAllFilters}
            onPickSuggestion={pickSuggestion}
            onPickFreeText={pickFreeText}
            ariaSearchLabel="Search runners"
            listboxId="runner-search-listbox"
            style={{ flex: '0 1 420px', minWidth: 260 }}
          />
          <div className="runners-toolbar-actions">
            <Button
              className={styles.refreshButton}
              icon={<ReloadOutlined />}
              loading={isRefreshingScoped || runnersQuery.isRefetching}
              disabled={!hasGroups || selectedEnvId === undefined}
              onClick={() => {
                if (selectedEnvId !== undefined) {
                  triggerScopedRefresh(selectedEnvId, selectedGroupIdValue)
                  void runnersQuery.refetch()
                }
              }}
            >
              Refresh
            </Button>
          </div>
        </div>

        <AnalyticsLoadingGate
          active={hasGroups && (runnersQuery.isLoading || datasetIsPending(readinessData, 'runners', runnersQuery.isLoading)) && filtered.length === 0}
          className="analytics-loading-gate--full"
          error={runnersQuery.isError ? {
            message: 'Unable to load runner data',
            description: runnersQuery.error instanceof Error ? runnersQuery.error.message : 'The request failed. Try refreshing or check your environment and group settings.',
          } : undefined}
        >
          {selectedEnvId == null || selectedGroupId == null ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 200 }}>
              <Empty description="No groups available for this environment." />
            </div>
          ) : runners.length === 0 && !runnersQuery.isError ? (
            <div className="pipelines-empty">
              <WarningOutlined />
              <strong>No runner data available for this group</strong>
              <p>The group may have no self-hosted runners, or the GitLab token may need Owner/Admin permission to read group runners. Pipeline and project data remain available.</p>
            </div>
          ) : filtered.length === 0 && !runnersQuery.isError ? (
            <div className="pipelines-empty">
              <InfoCircleOutlined />
              <strong>No runners match selected filters</strong>
              <p>Try adjusting your filters or sync settings.</p>
            </div>
          ) : (
            <div className="user-activity-table-wrapper runnerTableWrapper">
              <table className="gitops-data-table runner-table app-data-table">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Type</th>
                    <th>Group / Project</th>
                    <th>Address</th>
                    <th>Status</th>
                    <th>Tags</th>
                    <th>Jobs</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRunners.map((item) => {
                    const runner = item.runner
                    const status = getRunnerStatus(runner)
                    const typeLabel = runnerType(runner.runner_type)
                    const scope = getRunnerScope(runner)
                    const tagList = runner.tag_list
                    const address = runner.ip_address
                    const jobs = item.jobs
                    return (
                      <tr key={runner.id}>
                        <td><strong>#{runner.id}</strong></td>
                        <td>{typeLabel}</td>
                        <td>
                          {runner.projects.length > 0 ? (
                            <a
                              href={`${selectedEnvBaseUrl || 'https://gitlab.appfuxion.com'}/${runner.projects[0].path_with_namespace}/-/runners`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View runners for this project/group"
                            >
                              {scope}
                            </a>
                          ) : (
                            <span title="View runners for this group">{scope}</span>
                          )}
                        </td>
                        <td>
                          {address ? (
                            <span className={styles.addressTag}>{address}</span>
                          ) : (
                            <span className={styles.ipUnavailable}>Unavailable</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`status-badge ${STATUS_BADGE_CLASS(status)}`}
                            style={{
                              '--runner-status-color': STATUS_COLORS[status] || '#8b9298',
                            } as React.CSSProperties}
                          >
                            {status}
                          </span>
                        </td>
                        <td>
                          {tagList.length === 0 ? (
                            <span>-</span>
                          ) : (
                            <span>
                              {tagList.map((tag, idx) => (
                                <span key={tag}>
                                  {idx > 0 && ', '}
                                  <a
                                    href={`${selectedEnvBaseUrl || 'https://gitlab.appfuxion.com'}/groups/${runner.scope_name}/-/runners/${runner.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      color: 'var(--dashboard-text)',
                                      textDecoration: 'none',
                                    }}
                                  >
                                    {tag}
                                  </a>
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td>
                          {jobs.length === 0 ? (
                            status === 'running' ? (
                              <span className={styles.noJob}>Job details unavailable</span>
                            ) : (
                              <span>-</span>
                            )
                          ) : (
                            <div className={styles.jobList}>
                              {jobs.slice(0, 4).map((job) => (
                                <Tooltip
                                  key={job.id}
                                  title={`${job.name} :: ${job.stage} :: ${job.ref || job.pipeline?.ref || '-'} :: pipeline #${job.pipeline?.id || job.pipeline_id || '-'}`}
                                >
                                  <a href={job.web_url} target="_blank" rel="noopener noreferrer">
                                    <Tag className={styles.jobTag}>
                                      {job.name} · #{job.pipeline?.id || job.pipeline_id}
                                    </Tag>
                                  </a>
                                </Tooltip>
                              ))}
                              {jobs.length > 4 && <Tag>+{jobs.length - 4} more</Tag>}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <TablePaginator
                current={page}
                totalPages={Math.max(1, Math.ceil(filtered.length / pageSize))}
                pageSize={pageSize}
                pageSizes={PAGE_SIZE_OPTIONS}
                pageSizeKey={RUNNERS_PAGE_SIZE_KEY}
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
