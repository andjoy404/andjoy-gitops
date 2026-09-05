import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Table,
  Tag,
  Select,
  Button,
  Tooltip,
  Space,
  message as antdMessage,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CaretDownOutlined, CaretUpOutlined, ReloadOutlined, StarFilled, StarOutlined, MenuFoldOutlined, MenuUnfoldOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { api } from '../services/api'
import { useFavorites } from '../services/favorites'
import { useScopedRefresh } from '../hooks/useSyncRefresh'
import { TIME_RANGES } from '../utils/timeRanges'
import { useGroupContext } from '../contexts/GroupContext'
import PipelineExchangeMark from '../components/PipelineExchangeMark'
import AnalyticsLoadingGate, { datasetIsPending } from '../components/AnalyticsLoadingGate'
import TablePaginator from '../components/TablePaginator'
import FieldSearchBox, { type FieldSearchBoxFilterChip } from '../components/FieldSearchBox'
import type {
  PipelineStatus,
  PipelineSource,
  JobStatus,
  Pipeline,
} from '../types'
import type { PipelineInfo, JobInfo } from '../types'
import type { GlobalConfigDTO } from '../types'
import {
  PIPELINE_STATUS_COLORS,
  PIPELINE_STATUSES,
  formatTimeAgo,
  formatRelative,
  pipelineLastRunTime,
  pipelineRowKey,
  PipelineJobBadges,
  PipelineDetailModal,
} from '../utils/pipelineShared'
import styles from '../styles/pipelines.module.css'
import '../styles/pipelines.css'

const FETCH_REFRESH_INTERVAL = 10_000

const PIPELINE_TIME_RANGES = TIME_RANGES.map(({ hours, label }) => ({ value: hours, label }))

const PIPELINE_RANGE_STORAGE_KEY = 'analytics_range_pipelines'

const PIPELINE_PAGE_SIZES = [10, 20, 30, 40, 50, 100]
const PIPELINE_PAGE_SIZE_STORAGE_KEY = 'analytics_page_size_pipelines'

function getStoredPipelineHours(): number {
  try {
    const parsed = Number(localStorage.getItem(PIPELINE_RANGE_STORAGE_KEY))
    if (PIPELINE_TIME_RANGES.some(({ value }) => value === parsed)) return parsed
  } catch { /* localStorage may be unavailable */ }
  return 24
}

function getStoredPipelinePageSize(): number {
  try {
    const parsed = Number(localStorage.getItem(PIPELINE_PAGE_SIZE_STORAGE_KEY))
    if (PIPELINE_PAGE_SIZES.includes(parsed)) return parsed
  } catch { /* localStorage may be unavailable */ }
  return 20
}



const PIPELINE_JOBS_VISIBLE_KEY = 'pipeline_jobs_visible'

function getStoredJobsVisible(): boolean {
  try {
    const stored = localStorage.getItem(PIPELINE_JOBS_VISIBLE_KEY)
    if (stored === 'true') return true
    if (stored === 'false') return false
  } catch { /* ignore */ }
  return false
}

/* ── Field-aware search ─────────────────────────────────────────────── */

type PipelineSearchField = 'all' | 'favorites' | 'status' | 'group' | 'project' | 'branch'

const PIPELINE_SEARCH_FIELDS: { value: PipelineSearchField; label: string }[] = [
  { value: 'all', label: 'All fields' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'status', label: 'Status' },
  { value: 'group', label: 'Group' },
  { value: 'project', label: 'Project' },
  { value: 'branch', label: 'Branch' },
]

interface PipelineSearchFilter {
  field: PipelineSearchField
  value: string
}

interface PipelineRawItem {
  project: Pipeline.ProjectDTO
  pipelines: PipelineInfo[]
}

function pipelineSearchFieldsFor(
  field: PipelineSearchField,
  item: PipelineRawItem,
): string[] {
  const { project, pipelines } = item
  const groupPath = project.namespace.path || ''
  const projectName = project.name || ''
  const projectPath = project.path || ''
  const refs = pipelines.map((p) => p.ref).filter(Boolean)
  const statuses = pipelines.map((p) => p.status).filter(Boolean)
  switch (field) {
    case 'group':
      return [groupPath]
    case 'project':
      return [projectName, projectPath]
    case 'branch':
      return refs
    case 'status':
      return statuses
    case 'all':
      return [groupPath, projectName, projectPath, ...refs, ...statuses]
    case 'favorites':
      return [item.project.id.toString()]
  }
}



/* ── CheckableTag helper ────────────────────────────────────────────── */

function CheckableTag({
  checked,
  onClick,
  children,
  style,
}: {
  checked: boolean
  onClick: () => void
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <Tag
      className={`checkable-tag${checked ? ' checkable-tag-selected' : ''}`}
      onClick={onClick}
      style={{ cursor: 'pointer', ...style }}
    >
      {children}
    </Tag>
  )
}

/* ── Topics Filter Bar ──────────────────────────────────────────────── */

function TopicsFilterBar({
  projects,
  filterTopics,
  onChange,
}: {
  projects: { topics: string[] }[]
  filterTopics: string[]
  onChange: (topics: string[]) => void
}) {
  const allTopics = useMemo(() => {
    const topicSet = new Set<string>()
    for (const p of projects) {
      for (const t of (p.topics as string[])) {
        topicSet.add(t)
      }
    }
    return Array.from(topicSet).sort((a, b) => a.localeCompare(b))
  }, [projects])

  if (allTopics.length === 0) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>Filter by topic</span>
      {allTopics.map((topic) => {
        const isSelected = filterTopics.includes(topic)
        return (
          <CheckableTag
            key={topic}
            checked={isSelected}
            onClick={() => {
              if (isSelected) {
                onChange(filterTopics.filter((t) => t !== topic))
              } else {
                onChange([...filterTopics, topic])
              }
            }}
            style={{
              fontSize: 0.85,
              padding: '2px 8px',
              borderColor: isSelected ? 'var(--dashboard-accent)' : undefined,
              backgroundColor: isSelected ? 'color-mix(in srgb, var(--dashboard-accent) 22%, var(--dashboard-surface))' : undefined,
              color: isSelected ? 'color-mix(in srgb, var(--dashboard-accent) 86%, var(--dashboard-text))' : undefined,
            }}
          >
            {topic.toLowerCase()}
          </CheckableTag>
        )
      })}
    </div>
  )
}

/* ── Pipelines Page ─────────────────────────────────────────────────── */

interface PipelineTableRow {
  groupPath: string
  groupName: string
  projectId: number
  projectName: string
  projectPath: string
  projectDefaultBranch: string
  projectWebUrl: string
  projectTopics: string[]
  projectIdStr: string
  latestPipeline?: PipelineInfo
  allPipelines: PipelineInfo[]
}

export default function PipelinesPage() {
  const { selectedGroupId, selectedEnvId } = useGroupContext()
  const [pipelineView, setPipelineView] = useState<string>('latest')
  const [searchField, setSearchField] = useState<PipelineSearchField>('all')
  const [searchFilters, setSearchFilters] = useState<PipelineSearchFilter[]>([])
  const [filterTopics, setFilterTopics] = useState<string[]>([])
  const [hours, setHours] = useState(getStoredPipelineHours)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(getStoredPipelinePageSize)
  const [lastRunSort, setLastRunSort] = useState<'desc' | 'asc'>('desc')
  const [jobsVisible, setJobsVisible] = useState(() => getStoredJobsVisible())
  const [selectedPipeline, setSelectedPipeline] = useState<PipelineInfo | null>(null)
  const [selectedPipelineJobs, setSelectedPipelineJobs] = useState<JobInfo[]>([])

  useEffect(() => {
    try {
      localStorage.setItem(PIPELINE_JOBS_VISIBLE_KEY, String(jobsVisible))
    } catch { /* ignore */ }
  }, [jobsVisible])

  const { isFavorite: isProjFavorite, toggleFavorite } = useFavorites(selectedGroupId || 0)

  /* ── Fix 1: Read pipeline_view from GlobalConfig ──────────────────── */

  const { data: globalConfig } = useQuery({
    queryKey: ['global-config'],
    queryFn: () => api.getGlobalConfig(),
    staleTime: 300_000,
  })

  const pipelineViewFromConfig = (globalConfig as GlobalConfigDTO | undefined)?.pipeline_view || 'latest'
  const pipelineViewEffective = pipelineViewFromConfig === 'all' ? 'all' : 'latest'

  /* ── Readiness / sync notification ───────────────────────────────── */

  const selectedGroupIdValue = selectedGroupId || 0
  const hasGroups = selectedGroupIdValue > 0
  const { trigger: triggerScopedRefresh, isRefreshing: isRefreshingScoped } = useScopedRefresh({
    envId: selectedEnvId,
    groupId: selectedGroupIdValue || undefined,
  })

  /* Observe the shared readiness signal (same key as the Shell-mounted
     useSyncRefresh) so the polling source is single: this page adds no
     refetchInterval of its own. A scoped refresh marks the sync running
     again, which re-arms the shared polling, and the datasets refetch via
     the scope invalidation the shared observer performs. */
  const readinessQuery = useQuery({
    queryKey: ['analytics-readiness', selectedEnvId, selectedGroupIdValue],
    queryFn: () => api.getAnalyticsReadiness(selectedGroupIdValue),
    enabled: hasGroups,
    staleTime: 10_000,
  })

  /* ── Fix 3: 10s auto-refresh via refetchInterval ──────────────────── */

  const { data: pipelineProjects, isLoading, isError: isPipelineError, error: pipelineError } = useQuery({
    queryKey: ['pipeline-projects', selectedEnvId, selectedGroupId, pipelineView, hours],
    queryFn: () =>
      api.getPipelineProjects({ group_id: selectedGroupId || 0, hours, pipeline_view: pipelineView }),
    refetchInterval: FETCH_REFRESH_INTERVAL,
    staleTime: 5_000,
    enabled: !!selectedGroupId,
  })

  /* ── Derived: filtered + projected rows ───────────────────────────── */

  /* Group/project fields filter the project as a unit. Status/branch/all are
     applied to each pipeline individually so the rows that survive are
     exactly the pipelines that match the filters. */
   const PROJECT_ONLY_FIELDS: ReadonlySet<PipelineSearchField> = new Set(['group', 'project', 'favorites'])

   const projectScopedMatch = (item: PipelineRawItem, filters: PipelineSearchFilter[]): boolean => {
     for (const field of ['group', 'project'] as PipelineSearchField[]) {
       const fieldFilters = filters.filter(f => f.field === field && f.value.trim())
       if (fieldFilters.length === 0) continue
       const values = pipelineSearchFieldsFor(field, item).map((v) => v.toLowerCase())
       const matches = fieldFilters.some(f => {
         const text = f.value.trim().toLowerCase()
         return text && values.some(v => v.includes(text))
       })
       if (!matches) return false
     }

     const favFilters = filters.filter(f => f.field === 'favorites' && f.value.trim())
     if (favFilters.length > 0 && !isProjFavorite(item.project.id)) return false

     return true
   }

    const pipelineScopedMatch = (
      project: { namespace: { path?: string }; name?: string; path?: string },
      pipeline: PipelineInfo,
      filters: PipelineSearchFilter[],
    ): boolean => {
      const ref = String(pipeline.ref || '').trim().toLowerCase()
      const status = String(pipeline.status || '').trim().toLowerCase()
      const allValues = [
        String(project.namespace?.path || '').toLowerCase(),
        String(project.name || '').toLowerCase(),
        String(project.path || '').toLowerCase(),
        ref,
        status,
      ]

      const statusFilters = filters.filter(f => f.field === 'status' && f.value.trim())
      if (statusFilters.length > 0) {
        if (!statusFilters.some(f => status === f.value.trim().toLowerCase())) return false
      }

      const branchFilters = filters.filter(f => f.field === 'branch' && f.value.trim())
      if (branchFilters.length > 0) {
        if (!branchFilters.some(f => ref.includes(f.value.trim().toLowerCase()))) return false
      }

      const allFilters = filters.filter(f => f.field === 'all' && f.value.trim())
      if (allFilters.length > 0) {
        if (!allValues.some((v) => v && allFilters.some(f => v.includes(f.value.trim().toLowerCase())))) return false
      }

      return true
    }

   const projectRows = useMemo<PipelineTableRow[]>(() => {
    if (!pipelineProjects) return []

    const projectRows: PipelineTableRow[] = []
    const pipelineViewSel = pipelineView === 'all' || pipelineViewFromConfig === 'all' ? 'all' : 'latest'

    for (const groupData of pipelineProjects) {
      const project = groupData.project
      const groupPath = project.namespace.path || ''
      const groupName = project.namespace.name || ''
      const topics = (project.topics as string[]) || []

      /* topic filter: apply here to filter projects first */
      if (filterTopics.length > 0) {
        const hasMatchingTopic = topics.some((t) => filterTopics.includes(t))
        if (!hasMatchingTopic) continue
      }

      /* Project-level filters (group/project) */
      if (!projectScopedMatch(groupData, searchFilters)) continue

      /* latest view — keep only newest pipeline per ref FIRST, so pipeline-level
         filters (status/branch) match the pipeline actually displayed for that ref */
      let candidatePipelines = groupData.pipelines
      if (pipelineViewSel === 'latest') {
        const latestByRef = new Map<string, PipelineInfo>()
        for (const p of candidatePipelines) {
          const existing = latestByRef.get(p.ref)
          if (!existing || p.updated_at > existing.updated_at) {
            latestByRef.set(p.ref, p)
          }
        }
        candidatePipelines = Array.from(latestByRef.values())
      }

      /* Pipeline-level filters (status/branch/all) — per-pipeline */
      const filtered = candidatePipelines.filter(
        (p) => pipelineScopedMatch(project, p, searchFilters),
      )

      if (filtered.length === 0) continue

      for (const p of filtered) {
        projectRows.push({
          groupPath,
          groupName,
          projectId: project.id,
          projectName: project.name,
          projectPath: project.path,
          projectDefaultBranch: project.default_branch,
          projectWebUrl: project.web_url,
          projectTopics: topics,
          projectIdStr: `${project.namespace.path}/${project.path}`,
          latestPipeline: p,
          allPipelines: groupData.pipelines,
        })
      }
    }

    return projectRows
  }, [pipelineProjects, searchFilters, filterTopics, pipelineView, pipelineViewFromConfig])

  /* ── Derived: rows ordered by last-run time (raw time, nulls last) ───── */

  const sortedRows = useMemo<PipelineTableRow[]>(() => {
    const dir = lastRunSort === 'asc' ? 1 : -1
    return [...projectRows].sort((a, b) => {
      const ta = pipelineLastRunTime(a)
      const tb = pipelineLastRunTime(b)
      if (ta === null && tb === null) return 0
      if (ta === null) return 1  // no timestamp → always last
      if (tb === null) return -1 // no timestamp → always last
      return (ta - tb) * dir
    })
  }, [projectRows, lastRunSort])

  const totalPages = Math.ceil(sortedRows.length / pageSize)
  const paginated = sortedRows.slice((page - 1) * pageSize, page * pageSize)

  /* ── Fix 4 continued: Batch jobs query ────────────────────────────── */

  const pagePipelineIds = useMemo(() => {
    return paginated.flatMap(r => r.latestPipeline ? [r.latestPipeline.id] : [])
  }, [paginated])

  const pipelineIdsStr = pagePipelineIds.join(',')

  const { data: allBatchJobs } = useQuery({
    queryKey: ['batch-jobs', selectedEnvId, pipelineIdsStr],
    queryFn: () => api.getBatchJobs(pipelineIdsStr),
    enabled: pipelineIdsStr.length > 0,
    staleTime: 10_000,
    refetchInterval: FETCH_REFRESH_INTERVAL,
  })

  const jobsByPipeline = useMemo(() => {
    const map = new Map<number, JobInfo[]>()
    if (allBatchJobs) {
      for (const job of allBatchJobs) {
        const existing = map.get(job.pipeline_id) || []
        existing.push(job)
        map.set(job.pipeline_id, existing)
      }
    }
    return map
  }, [allBatchJobs])

  /* ── Status counts ────────────────────────────────────────────────── */

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of PIPELINE_STATUSES) counts[s.value] = 0
    for (const g of pipelineProjects || []) {
      for (const p of g.pipelines) {
        counts[p.status] = (counts[p.status] || 0) + 1
      }
    }
    return counts
  }, [pipelineProjects])

  const SUMMARY_STATUS_ORDER: PipelineStatus[] = ['running', 'success', 'manual', 'failed', 'pending', 'canceled']
  const summaryStatuses = PIPELINE_STATUSES
    .filter(({ value }) => (statusCounts[value] || 0) > 0)
    .sort((a, b) => {
      const ia = SUMMARY_STATUS_ORDER.indexOf(a.value)
      const ib = SUMMARY_STATUS_ORDER.indexOf(b.value)
      if (ia === -1) return ib === -1 ? 0 : 1
      if (ib === -1) return -1
      return ia - ib
    })
  const summaryTotal = summaryStatuses.reduce((total, { value }) => total + (statusCounts[value] || 0), 0)
  const searchSuggestions = useMemo<Record<string, { value: string; label: string; color?: string }[]>>(() => {
    const result: Record<string, { value: string; label: string; color?: string }[]> = {}
    for (const f of PIPELINE_SEARCH_FIELDS) {
      if (f.value === 'favorites') {
        result[f.value] = [{ value: 'Favorites', label: '⭐ Favorites' }]
      } else {
        const values = new Set<string>()
        for (const item of pipelineProjects || []) {
          for (const value of pipelineSearchFieldsFor(f.value, item)) {
            const trimmed = value.trim()
            if (trimmed && trimmed !== '-') values.add(trimmed)
          }
        }
        result[f.value] = [...values].sort((a, b) => a.localeCompare(b)).map((v) => ({
          value: v,
          label: v,
          color: f.value === 'status' ? (PIPELINE_STATUS_COLORS[v as PipelineStatus] || undefined) : undefined,
        }))
      }
    }
    return result
  }, [pipelineProjects])

  const fieldLabelOf = (f: string) => PIPELINE_SEARCH_FIELDS.find((x) => x.value === f)?.label ?? f

  const searchChips = useMemo<FieldSearchBoxFilterChip[]>(() => searchFilters.map((f) => ({
    key: `${f.field}::${f.value}`,
    field: f.field,
    fieldLabel: fieldLabelOf(f.field),
    valueLabel: f.value,
    color: f.field === 'status' ? (PIPELINE_STATUS_COLORS[f.value as PipelineStatus] || '#9AA3AD') : undefined,
  })), [searchFilters])

  const pickPipelineFilter = useCallback((field: string, value: string) => {
    setSearchFilters((prev) => {
      if (prev.some((f) => f.field === field && f.value.toLowerCase() === value.toLowerCase())) return prev
      return [...prev, { field: field as PipelineSearchField, value }]
    })
    setPage(1)
  }, [])

  const toggleFavoritesFilter = useCallback(() => {
    setSearchFilters((prev) => {
      const existed = prev.some((f) => f.field === 'favorites' && f.value === 'Favorites')
      if (existed) return prev.filter((f) => f.field !== 'favorites' || f.value !== 'Favorites')
      return [...prev, { field: 'favorites' as PipelineSearchField, value: 'Favorites' }]
    })
    setPage(1)
  }, [])

  const removePipelineChip = useCallback((index: number) => {
    setSearchFilters((prev) => prev.filter((_, i) => i !== index))
    setPage(1)
  }, [])

  const clearPipelineFilters = useCallback(() => {
    setSearchFilters([])
    setPage(1)
  }, [])

  /* ── Sync notification derived from readiness + project data ──────── */

  const readiness = readinessQuery.data
  const showSoftLoading = hasGroups && projectRows.length === 0 &&
    datasetIsPending(readiness, 'pipelines', readinessQuery.isLoading || isLoading)

  /* ── Pipeline actions ─────────────────────────────────────────────── */

  const handleRetryPipeline = (projectId: number, pipelineId: number) => {
    api.retryPipeline(projectId, pipelineId)
      .then(() => {
        antdMessage.success('Pipeline retry initiated.')
      })
      .catch((err: Error) => {
        antdMessage.error(err.message || 'Failed to retry pipeline')
      })
  }

  const handleCancelPipeline = (projectId: number, pipelineId: number) => {
    api.cancelPipeline(projectId, pipelineId)
      .then(() => {
        antdMessage.success('Pipeline cancel initiated.')
      })
      .catch((err: Error) => {
        antdMessage.error(err.message || 'Failed to cancel pipeline')
      })
  }

  const handleDownloadArtifacts = (projectId: number, pipelineId: number) => {
    /* Navigate to download endpoint - triggers artifact download */
    window.open(`/api/pipelines/artifacts/pipeline/${pipelineId}?project_id=${projectId}`, '_blank')
  }

  /* ── Columns ──────────────────────────────────────────────────────── */

  const baseColumns: ColumnsType<typeof projectRows[number]> = [
    {
      title: 'Group',
      dataIndex: 'groupPath',
      key: 'group',
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: 'Project',
      dataIndex: 'projectName',
      key: 'project',
      render: (name: string, r) => (
        <Tooltip title={r.projectWebUrl ? `${r.projectWebUrl} · ${r.projectIdStr}` : r.projectIdStr}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
            {r.projectWebUrl ? (
              <a href={r.projectWebUrl} target="_blank" rel="noopener noreferrer">
                {name}
              </a>
            ) : (
              <span>{name}</span>
            )}
          </span>
        </Tooltip>
      ),
    },
    {
      title: '',
      key: 'favorite',
      width: 40,
      render: (_: unknown, r: PipelineTableRow) => (
        <StarFilled
          aria-label={isProjFavorite(r.projectId) ? 'Remove from favorites' : 'Add to favorites'}
          style={{
            color: isProjFavorite(r.projectId) ? '#F5A623' : '#C0C8D0',
            cursor: 'pointer',
            fontSize: 15,
            transition: 'color 0.2s ease, transform 0.15s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLSpanElement).style.transform = 'scale(1.15)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLSpanElement).style.transform = 'scale(1)'
          }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(r.projectId) }}
        />
      ),
    },
    {
      title: 'Branch',
      dataIndex: 'latestPipeline',
      key: 'branch',
      render: (latest: PipelineInfo | undefined, r) => {
        const ref = latest?.ref || r.projectDefaultBranch || '—'
        return <span className="pipeline-branch">{ref}</span>
      },
    },
    {
      title: 'Trigger',
      dataIndex: 'latestPipeline',
      key: 'source',
      render: (latest: PipelineInfo | undefined) => {
        const raw = String(latest?.source || 'unknown').trim() as PipelineSource
        return (
          <Tag
            className="pipeline-trigger-badge"
          >
            {raw.replace(/_/g, ' ')}
          </Tag>
        )
      },
    },
    {
      title: (
        <button
          type="button"
          className="pipeline-sorter-header"
          onClick={() => {
            setLastRunSort((cur) => (cur === 'desc' ? 'asc' : 'desc'))
            setPage(1)
          }}
          aria-label="Last Run"
        >
          Last Run
          <CaretUpOutlined
            className={lastRunSort === 'asc' ? 'pipeline-sorter-caret active' : 'pipeline-sorter-caret'}
            aria-hidden
          />
          <CaretDownOutlined
            className={lastRunSort === 'desc' ? 'pipeline-sorter-caret active' : 'pipeline-sorter-caret'}
            aria-hidden
          />
        </button>
      ),
      dataIndex: 'latestPipeline',
      key: 'updated_at',
      render: (latest: PipelineInfo | undefined) => (
        <span
          className="pipeline-last-run"
          title={latest?.updated_at || latest?.created_at || undefined}
        >
          {formatRelative(latest?.updated_at || latest?.created_at || '')}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'latestPipeline',
      key: 'status',
      render: (latest: PipelineInfo | undefined, r: PipelineTableRow) => {
        const s = String(latest?.status || 'unknown').trim() as PipelineStatus
        const color = PIPELINE_STATUS_COLORS[s] || '#9AA3AD'
        const pipeline = r.latestPipeline
        const jobs = pipeline && jobsByPipeline.get(pipeline.id) ? jobsByPipeline.get(pipeline.id)! : []
        return (
          <Tooltip title="Click for pipeline details">
            <Tag
              className="pipeline-status-badge"
              style={{
                '--status-color': color,
                cursor: pipeline ? 'pointer' : 'default',
              } as React.CSSProperties}
              onClick={() => {
                if (pipeline) {
                  setSelectedPipeline(pipeline)
                  setSelectedPipelineJobs(jobs)
                }
              }}
            >
              {s.replace(/_/g, ' ')}
            </Tag>
          </Tooltip>
        )
      },
    },
  ]

  const columns = useMemo(() => {
    if (!jobsVisible) return baseColumns
    return [
      ...baseColumns,
      {
        title: 'Jobs',
        key: 'jobs',
        className: 'pipeline-jobs-cell',
        ellipsis: false,
        render: (_: unknown, r: PipelineTableRow) => (
          <PipelineJobBadges
            projectId={r.projectId}
            pipelineId={r.latestPipeline?.id || 0}
            jobsByPipeline={jobsByPipeline}
            pipelineSha={r.latestPipeline?.sha}
            projectWebUrl={r.projectWebUrl}
          />
        ),
      },
    ]
  }, [baseColumns, jobsVisible, jobsByPipeline])

  return (
    <div className="app-content pipeline-page">
      <div className="pipeline-content">
        {/* Summary bar */}
        <div className="summary-bar">
          <div className="summary-bar-title">
            <span className="page-header-icon">
              <PipelineExchangeMark style={{ width: 20, height: 20 }} />
            </span>
            <div className="page-header-copy">
              <span>PIPELINES</span>
              <small>based on selected pipeline view</small>
            </div>
          </div>
          <div className="summary-bar-segments">
            {summaryStatuses.map(({ label, value }) => (
              <Tooltip key={value} title={`${label}: ${statusCounts[value] || 0}`}>
                <span style={{ '--summary-color': PIPELINE_STATUS_COLORS[value], flexGrow: statusCounts[value] || 0, flexBasis: `${summaryTotal ? ((statusCounts[value] || 0) / summaryTotal) * 100 : 0}%` } as React.CSSProperties} />
              </Tooltip>
            ))}
          </div>
        </div>

        <div className="data-workspace pipeline-workspace">
          {/* Filters row */}
          <div className="pipeline-toolbar">
            <Space wrap>
              <FieldSearchBox
                fields={PIPELINE_SEARCH_FIELDS}
                selectedField={searchField}
                onFieldChange={(f) => {
                  const isNewFavoritesField = f === 'favorites' && searchField !== 'favorites'
                  if (isNewFavoritesField) {
                    toggleFavoritesFilter()
                  }
                  setSearchField(f as PipelineSearchField)
                }}
                suggestions={searchSuggestions}
                filters={searchChips}
                onRemoveFilter={removePipelineChip}
                onClearAll={clearPipelineFilters}
                onPickSuggestion={(f, s) => pickPipelineFilter(f, s.value)}
                onPickFreeText={(f, t) => pickPipelineFilter(f, t)}
                ariaSearchLabel="Search pipelines"
                listboxId="pipeline-search-listbox"
                style={{ flexBasis: 420, minWidth: 260 }}
              />
              <div className="pipeline-range-control">
                <span>Range</span>
                <Select
                  className="range-select"
                  classNames={{ popup: { root: 'range-select-dropdown' } }}
                  value={hours}
                  options={PIPELINE_TIME_RANGES}
                  onChange={(value) => {
                    setHours(value)
                    setPage(1)
                    try { localStorage.setItem(PIPELINE_RANGE_STORAGE_KEY, String(value)) } catch { /* ignore */ }
                  }}
                />
              </div>
              <Button
                className="pipeline-refresh-button"
                icon={<ReloadOutlined />}
                loading={isRefreshingScoped}
                disabled={!hasGroups || selectedEnvId === undefined}
                onClick={() => {
                  if (selectedEnvId !== undefined) {
                    triggerScopedRefresh(selectedEnvId, selectedGroupIdValue)
                  }
                }}
              >
                Refresh
              </Button>
              <Button
                className="pipeline-refresh-button"
                data-testid="toggle-jobs"
                icon={jobsVisible ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
                onClick={() => setJobsVisible(!jobsVisible)}
                title={jobsVisible ? 'Hide jobs column' : 'Show jobs column'}
              >
                {jobsVisible ? 'Hide Jobs' : 'Show Jobs'}
              </Button>
            </Space>
          </div>

          <AnalyticsLoadingGate
            className="analytics-loading-gate--full"
            active={showSoftLoading}
            error={isPipelineError ? {
              message: 'Unable to load pipeline data',
              description: pipelineError instanceof Error ? pipelineError.message : 'The pipeline request failed.',
            } : undefined}
          >
            {sortedRows.length === 0 && !isPipelineError ? (
              <div className={styles.pipelinesEmpty}>
                <InfoCircleOutlined className={styles.emptyIcon} />
                <strong>No pipelines data</strong>
                <p>No pipeline runs found for the selected filter(s). Try adjusting your filters or sync settings.</p>
              </div>
            ) : sortedRows.length === 0 && isPipelineError ? null : (
              <>
                <Table
                  className="pipeline-data-table gitops-data-table"
                  columns={columns}
                  dataSource={paginated}
                  rowKey={pipelineRowKey}
                  loading={isLoading && !showSoftLoading}
                  pagination={false}
                />
                <TablePaginator
                  current={page}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  pageSizes={PIPELINE_PAGE_SIZES}
                  pageSizeKey={PIPELINE_PAGE_SIZE_STORAGE_KEY}
                  onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
                  onPageChange={setPage}
                />
              </>
            )}
          </AnalyticsLoadingGate>
        </div>

        <PipelineDetailModal
          pipeline={selectedPipeline}
          jobs={selectedPipelineJobs}
          onAfterClose={() => { setSelectedPipeline(null); setSelectedPipelineJobs([]) }}
          COLORS={PIPELINE_STATUS_COLORS}
        />
      </div>
    </div>
  )
}
