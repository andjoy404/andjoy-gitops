import React, { useState, useMemo, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import Button from 'antd/es/button'
import Tooltip from 'antd/es/tooltip'
import Typography from 'antd/es/typography'
import Empty from 'antd/es/empty'

import Select from 'antd/es/select'
import { ClusterOutlined, ReloadOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import { TIME_RANGES } from '../utils/timeRanges'
import RelationsGraphViewport, { type RelationsGraphViewportHandle } from '../components/graph/RelationsGraphViewport'
import { useGroupContext } from '../contexts/GroupContext'
import { api } from '../services/api'
import { groupsForEnvironment } from '../utils/federated'
import AnalyticsLoadingGate, { datasetIsPending } from '../components/AnalyticsLoadingGate'
import type { GroupDTO, AnalyticsReadiness } from '../types'

const { Text } = Typography

// ── Type mapping for Cytoscape elements ─────────────────────────────

const toCytoscapeNode = (node: {
  id: string
  type: string
  label: string
  secondary_label: string
  status?: string
  web_url?: string
}) => ({
  data: {
    id: node.id,
    type: node.type,
    label: node.label,
    secondaryLabel: node.secondary_label,
    status: node.status || '',
    webUrl: node.web_url || '',
  },
})

const toCytoscapeEdge = (edge: {
  id: string
  source: string
  target: string
  type: string
  evidence_type?: string
}) => ({
  data: {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    evidenceType: edge.evidence_type,
  },
})

// ── Drill-down model ─────────────────────────────────────────────────
//
// The user starts from one entity type (root). Below it, the related levels
// are revealed ONE AT A TIME: a dropdown only appears once every level above
// it has at least one selection. Like a hierarchy search filter — pick a group
// and the projects under it appear; pick projects and the branches + users for
// those projects appear.
// The graph updates live so it always shows the relationships in the current scope.

type Root = 'groups' | 'projects' | 'users'

const ROOT_OPTIONS: Array<{ value: Root; label: string }> = [
  { value: 'groups', label: 'Groups' },
  { value: 'projects', label: 'Projects' },
  { value: 'users', label: 'Users' },
]

type NodeId = number[]
type BranchId = string[]

const hasSelection = (arr: unknown[]) => arr.length > 0
const safeGitLabUrl = (value: unknown) => {
  const url = typeof value === 'string' ? value.trim() : ''
  return /^https?:\/\//i.test(url) ? url : ''
}

// Time range for the CICD map (project → branch → pipeline → job). Mirrors the
// Pipelines page Range control; only feeds the pipeline/job data.
const RELATIONS_RANGE_STORAGE_KEY = 'analytics_range_relations'
const RELATIONS_TIME_RANGES = TIME_RANGES.map(({ hours, label }) => ({ value: hours, label }))

const getStoredRelationsHours = () => {
  try {
    const parsed = Number(localStorage.getItem(RELATIONS_RANGE_STORAGE_KEY))
    if (RELATIONS_TIME_RANGES.some(({ value }) => value === parsed)) return parsed
  } catch { /* localStorage may be unavailable */ }
  return 24
}

// ── Option item shapes (from /api/graph/options) ─────────────────────

interface OptUser { id: number; username?: string; name?: string }
interface OptProject { id: number; name?: string; path_with_ns?: string }
interface GraphOptions {
  users: OptUser[]
  projects: OptProject[]
  branches: string[]
}

// ── Data fetching ────────────────────────────────────────────────────

function buildGraphParams(scope: {
  groupIds: string
  groupPaths?: string
  user_ids?: string
  project_ids?: string
  branch_names?: string
}) {
  const p = new URLSearchParams()
  if (scope.groupIds) p.set('group_ids', scope.groupIds)
  if (scope.groupPaths) p.set('group_paths', scope.groupPaths)
  if (scope.user_ids) p.set('user_ids', scope.user_ids)
  if (scope.project_ids) p.set('project_ids', scope.project_ids)
  if (scope.branch_names) p.set('branch_names', scope.branch_names)
  return p
}

// ── Level dropdown (themed multi-select) ─────────────────────────────

interface LevelOption<V extends string | number = string | number> {
  value: V
  label: string
  searchText?: string
}

interface LevelSelectProps<V extends string | number = string | number> {
  label: string
  placeholder?: string
  options: LevelOption<V>[]
  value: V[]
  onChange: (next: V[]) => void
  loading?: boolean
  accent?: string
  width?: number
}

function LevelSelect<V extends string | number>(props: LevelSelectProps<V>) {
  const { label, placeholder, options, value, onChange, loading, accent, width } = props

  return (
    <div className="drill-row" data-accent={accent || undefined}>
      <span className="drill-row-label">{label}</span>
      <Select
        mode="multiple"
        placeholder={placeholder ?? `Select ${label.toLowerCase()}…`}
        value={value || []}
        options={options}
        onChange={(next) => {
          const nextVals: V[] = next && next.length > 0 ? (next as unknown as V[]) : []
          onChange(nextVals)
        }}
        loading={loading}
        maxTagCount="responsive"
        style={{ width: width ?? '100%', minWidth: 220 }}
        popupMatchSelectWidth={false}
        classNames={{ popup: { root: 'relations-dropdown' } }}
        notFoundContent={loading ? 'Loading…' : 'No matches'}
      />
    </div>
  )
}

// ── Main Page Component ─────────────────────────────────────────────

const RelationsMapPage: React.FC = () => {
  const { selectedEnvId, envNamespaceId, selectedGroupId } = useGroupContext()

  const [root, setRoot] = useState<Root | null>(null)
  const [selGroups, setSelGroups] = useState<NodeId>([])
  const [selProjects, setSelProjects] = useState<NodeId>([])
  const [selUsers, setSelUsers] = useState<NodeId>([])
  const [selBranches, setSelBranches] = useState<BranchId>([])
  const [hours, setHours] = useState(getStoredRelationsHours)

  const [selectedNode, setSelectedNode] = useState<Record<string, any> | null>(null)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const graphRef = useRef<RelationsGraphViewportHandle>(null)

  // Groups for the current environment (federated ids) — all groups including
  // subgroups, matching the Pipelines page's group search behavior. Subgroups
  // are labelled with their full path so they stay unique in the dropdown.
  const { data: allGroups = [] } = useQuery<GroupDTO[]>({
    queryKey: ['groups', selectedEnvId],
    queryFn: api.getGroups,
    enabled: selectedEnvId !== undefined,
  })
  const envGroups = useMemo(
    () => (envNamespaceId != null ? groupsForEnvironment(allGroups, envNamespaceId) : []),
    [allGroups, envNamespaceId],
  )
  const allEnvGroupIds = useMemo(() => envGroups.map((g) => g.id).join(','), [envGroups])
  const hasScope = selectedEnvId !== undefined && envGroups.length > 0

  const clearAll = () => {
    setSelGroups([]); setSelProjects([]); setSelUsers([]); setSelBranches([])
  }

  const onRootChange = (v: string | null | undefined) => {
    if (v == null || v === 'undefined') { setRoot(null); setSelectedNode(null) }
    else { setRoot(v as Root); setSelectedNode(null); clearAll() }
  }

  // Cascade: changing a higher level clears every deeper level for the
  // active root, so the hierarchy stays coherent.
  const handleGroupChange = (next: NodeId) => {
    setSelGroups(next)
    if (root === 'groups') { setSelProjects([]); setSelUsers([]); setSelBranches([]) }
    else if (root === 'users') { setSelProjects([]) }
  }
  const handleProjectChange = (next: NodeId) => {
    setSelProjects(next)
    if (root === 'groups' || root === 'projects') { setSelUsers([]); setSelBranches([]) }
  }
  const handleUserChange = (next: NodeId) => {
    setSelUsers(next)
    if (root === 'users') { setSelGroups([]); setSelProjects([]) }
  }
  const handleBranchChange = (next: BranchId) => {
    setSelBranches(next)
  }

  // Concrete id lists feed the graph/options URLs.
  const cProjects = hasSelection(selProjects) ? selProjects.join(',') : undefined
  const cUsers = hasSelection(selUsers) ? selUsers.join(',') : undefined
  const cBranches = hasSelection(selBranches) ? selBranches.join(',') : undefined

  // Graph group scope: when groups are selected, expand them to their full
  // descendant chain (subgroups matched by full_path) so downstream
  // group_id-scoped queries pick up project / pipeline data nested in a
  // subgroup of the picked group — matching the Pipelines page, where a group
  // filter matches its subgroups. Also emit the selected groups' full_paths so
  // the backend can match projects by namespace subtree (its group_id alone
  // only equals the top-level sync root of the project, not a subgroup).
  // When nothing is selected, scope to the whole environment (already includes
  // subgroups).
  const groupScope = useMemo(() => {
    if (envNamespaceId == null) return ''
    if (!hasSelection(selGroups)) return hasScope ? allEnvGroupIds : ''
    const pathById = new Map(envGroups.map((g) => [g.id, g.full_path || '']))
    const selectedPaths = selGroups
      .map((s) => pathById.get(s))
      .filter((p): p is string => !!p)
    const out = selGroups.slice()
    for (const g of envGroups) {
      if (selGroups.includes(g.id)) continue
      const fp = g.full_path || ''
      if (selectedPaths.some((sp) => fp.startsWith(sp + '/'))) out.push(g.id)
    }
    return out.join(',')
  }, [selGroups, envGroups, envNamespaceId, hasScope, allEnvGroupIds])

  // Full paths of the *selected* groups (not the expanded set) — sent as
  // group_paths so the backend can subtree-match projects by their namespace.
  const groupScopePaths = useMemo(() => {
    if (!hasSelection(selGroups)) return ''
    const pathById = new Map(envGroups.map((g) => [g.id, g.full_path || '']))
    return selGroups.map((s) => pathById.get(s)).filter(Boolean).join(',')
  }, [selGroups, envGroups])

  // Whether the UGP or cicd graph is in play for the chosen root.
  const ugpActive =
    root === 'users' && (hasSelection(selUsers) || hasSelection(selGroups) || hasSelection(selProjects))
  const cicdActive =
    (root === 'groups' && (hasSelection(selGroups) || hasSelection(selProjects) || hasSelection(selBranches))) ||
    (root === 'projects' && (hasSelection(selProjects) || hasSelection(selBranches)))
  // ── Load readiness signal so we can show the gate while dataset is cold ──
  const { data: readinessData, isLoading: readinessLoading } = useQuery<AnalyticsReadiness>({
    queryKey: ['analytics-readiness', selectedEnvId, selectedGroupId],
    queryFn: () => api.getAnalyticsReadiness(selectedGroupId as number),
    enabled: !!selectedGroupId,
    staleTime: 10_000,
  })

  const selectedGroupIdValue = selectedGroupId || 0

  // ── UGP graph (user/group/project) ────────────────────────────────
  const ugp = useQuery({
      queryKey: ['graph-ugp', selectedEnvId, groupScope, groupScopePaths, cUsers, cProjects],
      queryFn: async () => {
        const p = buildGraphParams({ groupIds: groupScope, groupPaths: groupScopePaths, user_ids: cUsers, project_ids: cProjects, branch_names: undefined })
        const res = await fetch(`/api/graph?${p.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch graph data')
      return res.json()
    },
    enabled: hasScope && ugpActive,
  })

  // ── CICD graph (project/branch/pipeline/job) ──────────────────────
  const cicd = useQuery({
    queryKey: ['graph-cicd', selectedEnvId, groupScope, groupScopePaths, cProjects, cBranches, hours],
    queryFn: async () => {
      const p = new URLSearchParams()
      if (groupScope) p.set('group_ids', groupScope)
      if (groupScopePaths) p.set('group_paths', groupScopePaths)
      if (cProjects) p.set('project_ids', cProjects)
      if (cBranches) p.set('branch_names', cBranches)
      p.set('hours', String(hours))
      const res = await fetch(`/api/graph/cicd?${p.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch graph data')
      return res.json()
    },
    enabled: hasScope && cicdActive,
  })

  // ── Filter options (projects / branches / users for the dropdowns) ─
  // On CICD roots the backend also applies the active time range to the
  // project/branch filters, so items with no recent pipelines/jobs are not
  // offered (a pick would otherwise produce an empty map).
  const { data: filterOptions, isFetching: optionsLoading } = useQuery<GraphOptions>({
    queryKey: ['graph-options', root, groupScope, groupScopePaths, cProjects, cUsers, hours],
    queryFn: async () => {
      const p = new URLSearchParams({ type: 'users' })
      if (groupScope) p.set('group_ids', groupScope)
      if (groupScopePaths) p.set('group_paths', groupScopePaths)
      if (cProjects) p.set('project_ids', cProjects)
      if (root === 'users' && cUsers) p.set('user_ids', cUsers)
      p.set('hours', String(hours))
      p.set('cicd', String(root === 'groups' || root === 'projects'))
      const res = await fetch(`/api/graph/options?${p.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch graph options')
      const data = await res.json()
      return {
        users: Array.isArray(data.users) ? data.users : [],
        projects: Array.isArray(data.projects) ? data.projects : [],
        branches: Array.isArray(data.branches) ? data.branches : [],
      }
    },
    enabled: hasScope && root != null,
  })

  const isLoading = ugp.isFetching || cicd.isFetching
  const error = ugp.error ?? cicd.error

  // Exactly one graph is active for the current root: the user-group-project
  // map for Users roots, the cicd (project→branch→pipeline→job) map for
  // Groups and Projects roots. Render only its data so a previously cached
  // graph of the other kind never bleeds into the current scope.
  const activeGraph = root === 'users' ? ugp.data : cicd.data

  const elements = useMemo(() => {
    if (!activeGraph) return []
    return [
      ...activeGraph.nodes.map((n: any) => toCytoscapeNode(n)),
      ...activeGraph.edges.map((e: any) => toCytoscapeEdge(e)),
    ]
  }, [activeGraph])

  const mapType: 'user-group-project' | 'project-branch-pipeline-jobs' =
    root === 'projects' || root === 'groups' ? 'project-branch-pipeline-jobs' : 'user-group-project'

  // Graph renders once the entry-level (first) selection has content.
  const rootSelected =
    (root === 'groups' && hasSelection(selGroups)) ||
    (root === 'projects' && hasSelection(selProjects)) ||
    (root === 'users' && hasSelection(selUsers))

  // ── Dropdown option lists ──────────────────────────────────────────
  // Only offer groups that contain at least one project returned by the
  // relation-aware options query. That query already applies the selected
  // user and, for CICD roots, the active time range, so choosing a group can
  // no longer lead straight to an empty graph.
  const groupOpts: LevelOption<number>[] = useMemo(() => {
    const relatedProjectPaths = (filterOptions?.projects ?? [])
      .map((project) => project.path_with_ns || '')
      .filter(Boolean)

    return envGroups
      .filter((group) => {
        const groupPath = group.full_path || ''
        return groupPath && relatedProjectPaths.some((projectPath) => projectPath.startsWith(`${groupPath}/`))
      })
      .map((group) => ({
        value: group.id,
        label: group.full_path || group.name || String(group.id),
        searchText: `${group.name} ${group.full_path} ${group.id}`.toLowerCase(),
      }))
  }, [envGroups, filterOptions?.projects])
  // Project paths are shown relative to the selected starting group, so the
  // dropdown reads as the group's "extension" (e.g. selecting
  // example-org/platform/platform-3.0 shows "be/platform-api…", not the full path).
  const projectOpts: LevelOption<number>[] = useMemo(() => {
    const prefixes = (groupScopePaths ? groupScopePaths.split(',').map((s) => s.trim()).filter(Boolean) : []) as string[]
    const relativePath = (full: string) => {
      for (const gp of prefixes) {
        if (full.startsWith(gp + '/')) return full.slice(gp.length + 1)
      }
      return full
    }
    return (filterOptions?.projects ?? []).map((p) => {
      const full = p.path_with_ns || p.name || String(p.id)
      const rel = relativePath(full)
      return { value: p.id, label: rel || p.name || String(p.id), searchText: `${full} ${p.name} ${p.id}`.toLowerCase() }
    })
  }, [filterOptions?.projects, groupScopePaths])
  const userOpts: LevelOption<number>[] = useMemo(() => (filterOptions?.users ?? []).map((u) => ({ value: u.id, label: u.username || u.name || String(u.id), searchText: `${u.username} ${u.name} ${u.id}`.toLowerCase() })), [filterOptions?.users])
  const branchOpts: LevelOption<string>[] = useMemo(() => (filterOptions?.branches ?? []).map((b) => ({ value: b, label: b, searchText: b.toLowerCase() })), [filterOptions?.branches])

  // ── Level visibility — progressive drill-down. Each dropdown is hidden
  //    until the level directly above it has at least one selection, so only
  //    the active branch of the hierarchy is on screen at a time. ────────
  const g = hasSelection(selGroups)
  const p = hasSelection(selProjects)
  const u = hasSelection(selUsers)

  // root=groups:  [Groups] → [Projects] → [Branches]   (CICD map — no user level)
  // root=projects:[Projects] → [Branches]   (CICD map — no user level)
  // root=users:   [Users] → [Groups] → [Projects] → [Branches]
  const showGroups =
    root === 'groups' ||
    (root === 'users' && u)
  const showProjects =
    root === 'projects' ||
    (root === 'groups' && g) ||
    (root === 'users' && u && g)
  const showBranches =
    (root === 'groups' && p) ||
    (root === 'projects' && p)
  const showUsers =
    root === 'users'

  const handleNodeSelect = useCallback((node: Record<string, any> | null) => {
    if (!node) {
      setSelectedNode(null)
      setDetailCollapsed(true)
      return
    }
    setDetailCollapsed(false)
    setSelectedNode({
      id: node.data('id'),
      type: node.data('type'),
      label: node.data('label'),
      secondaryLabel: node.data('secondaryLabel'),
      status: node.data('status'),
      webUrl: safeGitLabUrl(node.data('webUrl')),
    })
  }, [])

  const countByType = (type: string) =>
    activeGraph?.nodes.filter((n: { type: string }) => n.type === type).length || 0

  const summarySegments = (
    [
      { label: 'Users', value: countByType('user'), color: '#7c3aed' },
      { label: 'Groups', value: countByType('group'), color: '#14b8a6' },
      { label: 'Projects', value: countByType('project'), color: '#22c55e' },
      { label: 'Branches', value: countByType('branch'), color: '#a0522d' },
      { label: 'Pipelines', value: countByType('pipeline'), color: '#f3a047' },
      { label: 'Jobs', value: countByType('job'), color: '#2563eb' },
    ]
  ).filter((s) => s.value > 0)
  const summaryTotal = summarySegments.reduce((sum, s) => sum + s.value, 0)

  const emptyLabel: Record<Root, string> = {
    groups: 'Select one or more groups to display the map.',
    projects: 'Select one or more projects to display the map.',
    users: 'Select one or more users to display the map.',
  }

  if (selectedEnvId === undefined || !hasScope) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Empty description="No groups available for this environment." />
      </div>
    )
  }

  return (
    <div className="relations-content">
      <div className="relations-page">
        {/* Summary bar (card) */}
        <div className="summary-bar">
          <div className="summary-bar-title">
            <ClusterOutlined aria-hidden className="page-header-icon" />
            <div className="page-header-copy">
              <span>RELATIONSHIPS</span>
              <small>nodes in current scope: {summaryTotal}</small>
            </div>
          </div>
          <div className="summary-bar-segments">
            {summarySegments.length === 0
              ? <span className="summary-empty" />
              : summarySegments.map(({ label, value, color }) => (
                <Tooltip key={label} title={`${label}: ${value}`}>
                  <span style={{ '--summary-color': color, flexGrow: value, flexBasis: `${summaryTotal ? (value / summaryTotal) * 100 : 0}%` } as React.CSSProperties} />
                </Tooltip>
              ))}
          </div>
        </div>

        <div className="relations-workspace">
        {/* Filter chain — a toolbar row inside the workspace card (mirrors the
            Pipelines/Runners toolbar rhythm). It starts with one empty entry
            searchbox; clicking it opens the starting-options dropdown. Each
            chosen level appends the next box to the right, and a box is only
            added once the box to its left has a selection. */}
        <div className="drill-chain">
          <div className={`drill-start${root || (root === 'groups' && hasSelection(selGroups)) || (root === 'projects' && hasSelection(selProjects)) || (root === 'users' && hasSelection(selUsers)) ? ' drill-start-active' : ''}`}>
            <span className="drill-row-label">Start point</span>
            <Select
              className="drill-root-select"
              id="relations-root"
              style={{ width: 160, minWidth: 160 }}
              value={root}
              options={ROOT_OPTIONS}
              placeholder="Start point"
              allowClear
              onClear={() => { setRoot(null); clearAll(); setSelectedNode(null) }}
              popupMatchSelectWidth
              classNames={{ popup: { root: 'relations-dropdown' } }}
              onChange={async (v) => {
                setRoot(v as Root)
                setSelectedNode(null)
                clearAll()
              }}
            />
          </div>

          {showUsers && (
            <LevelSelect
              label="Users"
              placeholder="Select users…"
              options={userOpts}
              value={selUsers}
              onChange={handleUserChange}
              loading={optionsLoading}
            />
          )}

          {showGroups && (
            <LevelSelect
              label="Groups"
              placeholder="Select groups…"
              options={groupOpts}
              value={selGroups}
              onChange={handleGroupChange}
              loading={optionsLoading}
            />
          )}

          {showProjects && (
            <LevelSelect
              label="Projects"
              placeholder="Select projects…"
              options={projectOpts}
              value={selProjects}
              onChange={handleProjectChange}
              loading={optionsLoading}
            />
          )}

          {showBranches && (
            <LevelSelect
              label="Branches"
              placeholder="Select branches…"
              options={branchOpts}
              value={selBranches}
              onChange={handleBranchChange}
              loading={optionsLoading}
            />
          )}

          <div className="drill-range-control">
            <span>Range</span>
            <Select
              className="range-select"
              classNames={{ popup: { root: 'range-select-dropdown' } }}
              value={hours}
              options={RELATIONS_TIME_RANGES}
              onChange={(value) => {
                setHours(value)
                try { localStorage.setItem(RELATIONS_RANGE_STORAGE_KEY, String(value)) } catch { /* ignore */ }
              }}
            />
          </div>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => graphRef.current?.revertPositions()}
            className="drill-reset"
          >
            Reset positions
          </Button>
        </div>

        {/* Content Area */}
        <AnalyticsLoadingGate
          className="analytics-loading-gate--full"
          active={hasScope && datasetIsPending(readinessData, 'relationships', isLoading) && rootSelected && elements.length === 0}
          error={error ? {
            message: 'Unable to load relationships',
            description: 'The request failed. Try refreshing or check your environment and group settings.',
          } : undefined}
        >
          <div className="relations-graph-row">
          <div className="relations-graph">
            {!rootSelected && !isLoading && (
              <div className="relations-graph-empty">

                <ClusterOutlined className="empty-icon" />
                <strong>{root ? emptyLabel[root] : 'Pick a starting point to build the map.'}</strong>
                <p>Choose a root entity type above, then select specific items to explore their relationships.</p>
              </div>
            )}
            {rootSelected && isLoading && (
              <div className="relations-graph-empty">
                <span className="empty-icon">{'●'}</span>
                <p>Loading relationships...</p>
              </div>
            )}
            {rootSelected && error && (
              <div className="relations-graph-error">Error loading relationships: {(error as Error).message}</div>
            )}
            {rootSelected && !isLoading && !error && (
              <>
                {elements.length === 0 ? (
                  <div className="relations-graph-empty">
                    <Empty description="No relationships found for this scope." />
                  </div>
                ) : (
                  <RelationsGraphViewport
                    ref={graphRef}
                    elements={elements}
                    mapType={mapType}
                    onNodeSelect={handleNodeSelect}
                    onNodeHover={() => {}}
                  />
                )}
              </>
            )}
          </div>

          {/* Detail Panel */}
          {selectedNode && (
            <div className={`relations-detail${detailCollapsed ? ' relations-detail-collapsed' : ''}`}>
              {detailCollapsed ? (
                <Tooltip title="Show node detail">
                  <Button
                    size="small"
                    type="text"
                    className="relations-detail-toggle"
                    icon={<MenuUnfoldOutlined />}
                    onClick={() => setDetailCollapsed(false)}
                  />
                </Tooltip>
              ) : (
                <>
                  <div className="relations-detail-head">
                    <span className="relations-detail-title">Details</span>
                    <Tooltip title="Hide node detail">
                      <Button
                        size="small"
                        type="text"
                        className="relations-detail-toggle"
                        icon={<MenuFoldOutlined />}
                        onClick={() => setDetailCollapsed(true)}
                      />
                    </Tooltip>
                  </div>
                  <div className="relations-detail-body-wrap">
                    <div className="relations-detail-body">
                      <div className="relations-detail-content" key={selectedNode.id}>
                        <Text strong>{selectedNode.type}</Text>
                        <DetailItem label="ID" value={String(selectedNode.id)} />
                        <DetailItem
                          label="Name"
                          value={selectedNode.webUrl ? (
                            <a
                              className="relations-detail-link"
                              href={String(selectedNode.webUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Open ${String(selectedNode.label)} in GitLab`}
                            >
                              {String(selectedNode.label)}
                            </a>
                          ) : String(selectedNode.label)}
                        />
                        {selectedNode.secondaryLabel && <DetailItem label="Secondary" value={String(selectedNode.secondaryLabel)} />}
                        {selectedNode.status && <DetailItem label="Status" value={String(selectedNode.status)} />}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          </div>
        </AnalyticsLoadingGate>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────

const DetailItem: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="relations-detail-item">
    <Text type="secondary" className="relations-detail-key">{label}</Text>
    <p className="relations-detail-value">{value}</p>
  </div>
)

export default RelationsMapPage

