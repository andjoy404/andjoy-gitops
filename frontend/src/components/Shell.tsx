import { useState, useCallback, useEffect, useRef } from 'react'
import type { FocusEvent as ReactFocusEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { Button, Space, Typography, Dropdown, Modal, Tag, Spin, Empty, Popover } from 'antd'
import type { MenuProps } from 'antd'
import {
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  CloudServerOutlined,
  TeamOutlined,
  ClusterOutlined,
  StarOutlined,
  ThunderboltOutlined,
  PushpinOutlined,
  PushpinFilled,
  RightOutlined,
} from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import Header from './Header'
import GroupSelectorModal from './GroupSelector'
import { GroupContext } from '../contexts/GroupContext'
import type { EnvironmentDTO, GlobalConfigDTO, GroupDTO } from '../types'
import { isAdminRole } from '../utils/role'
import { groupsForEnvironment, federatedGroupId, groupLocalId } from '../utils/federated'
import { useScopeRefresh, useSyncRefresh } from '../hooks/useSyncRefresh'
import DashboardMark from './DashboardMark'
import PipelineExchangeMark from './PipelineExchangeMark'
import FolderMark from './FolderMark'
const { Text } = Typography

// Admin-only entries, grouped under the single collapsible SETTINGS section
const SETTINGS_TABS = [
  { id: '/users', label: 'Users', icon: <UserOutlined /> },
  { id: '/environments', label: 'Environments', icon: <CloudServerOutlined /> },
  { id: '/global-config', label: 'Configurations', icon: <SettingOutlined /> },
]

const ALL_TABS = [
  { id: '/dashboard', label: 'Dashboard', icon: <DashboardMark style={{ width: 16, height: 16 }} /> },
  { id: '/pipelines', label: 'Pipelines', icon: <PipelineExchangeMark style={{ width: 16, height: 16 }} /> },
  { id: '/runners', label: 'Runners', icon: <ThunderboltOutlined /> },
  { id: '/user-activity', label: 'User Activity', icon: <TeamOutlined /> },
  { id: '/relations-map', label: 'Relations Map', icon: <ClusterOutlined /> },
]

/* All tabs (includes SETTINGS) — used by mobile nav and the sidebar "Show all"
   button. Favorites removed. */
const SHOW_ALL_TABS = ALL_TABS  /* aliases: only top-level tabs */

/* Temporary (hover/focus) overlay only makes sense on pointer-capable
   desktop layouts; touch devices keep tap-to-expand on the logo. */
const OVERLAY_MEDIA_QUERY = '(hover: hover) and (pointer: fine) and (min-width: 801px)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const OVERLAY_CLOSE_DELAY_MS = 260

const groupStorageKeyFor = (envId: number): string => `gcd_selected_group_id_${envId}`

function readPersistedGroupId(envId: number | undefined): number | undefined {
  if (envId === undefined) return undefined
  const parsed = Number.parseInt(localStorage.getItem(groupStorageKeyFor(envId)) ?? '', 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

/* Fast default-group source. The environment's own configured `group_ids`
   (raw GitLab ids, stored in the DB) load instantly with the environments
   query, so we can pick a default before the live `/api/groups` fetch — which
   is cold on container restart — finishes. The raw id is wrapped into a
   federated id using the environment's namespace so it matches `group.id`.
   Returns undefined when the environment defines no groups. */
function seedDefaultGroup(env: EnvironmentDTO | undefined): number | undefined {
  if (!env || !env.group_ids || env.group_ids.length === 0) return undefined
  return federatedGroupId(env.namespace_id, env.group_ids[0])
}

/* Decide which group to keep once the active environment changes:
   1. keep the current selection when it still belongs to the environment,
   2. otherwise restore that environment's own last persisted group,
   3. otherwise the environment's first group.
   When no groups are visible at all, a previously observed group wins over
   clearing — a partial or stale dataset must not invalidate a valid
   selection. */
function resolveGroupForEnv(
  env: EnvironmentDTO | undefined,
  groups: GroupDTO[],
  currentGroupId: number | undefined,
  knownGroups: ReadonlyMap<number, string> | undefined,
): number | undefined {
  if (!env) return undefined
  const available = groupsForEnvironment(groups, env.namespace_id)
  if (available.length > 0) {
    if (currentGroupId !== undefined && available.some((group) => group.id === currentGroupId)) {
      return currentGroupId
    }
    const persisted = readPersistedGroupId(env.id)
    if (persisted !== undefined && available.some((group) => group.id === persisted)) {
      return persisted
    }
    return available[0].id
  }
  if (knownGroups && knownGroups.size > 0) {
    return currentGroupId !== undefined && knownGroups.has(currentGroupId) ? currentGroupId : undefined
  }
  return undefined
}

type SidebarMode = 'expanded' | 'rail' | 'overlay'

export default function Shell({ onLogout }: { onLogout?: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [groupsModalOpen, setGroupsModalOpen] = useState(false)
  const [envSelectorOpen, setEnvSelectorOpen] = useState(false)
  const [environmentHintOpen, setEnvironmentHintOpen] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('feature_menu_collapsed') === 'true'
    } catch {
      return false
    }
  })
  const [selectedEnvId, setSelectedEnvId] = useState<number | undefined>(() => {
    const stored = localStorage.getItem('gcd_selected_env_id')
    if (stored) {
      const id = parseInt(stored, 10)
      if (!isNaN(id)) return id
    }
    return undefined
  })
  const [selectedGroupId, setSelectedGroupIdState] = useState<number | undefined>(() => {
    const stored = localStorage.getItem('gcd_selected_group_id')
    const id = stored ? Number.parseInt(stored, 10) : NaN
    return Number.isFinite(id) ? id : undefined
  })
  const isAdmin = isAdminRole(localStorage.getItem('user_role'))
  const [sessionUsername] = useState<string | undefined>(() => localStorage.getItem('user_username') ?? undefined)

  const [overlayCapable, setOverlayCapable] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia !== undefined &&
      window.matchMedia(OVERLAY_MEDIA_QUERY).matches,
  )
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia !== undefined &&
      window.matchMedia(REDUCED_MOTION_QUERY).matches,
  )
  const [overlayOpen, setOverlayOpen] = useState(false)
  const overlayCloseTimer = useRef<number | null>(null)
  const sidebarSlotRef = useRef<HTMLDivElement>(null)
  const focusInsideRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia === undefined) return
    const subscriptions = [
      { media: window.matchMedia(OVERLAY_MEDIA_QUERY), apply: setOverlayCapable },
      { media: window.matchMedia(REDUCED_MOTION_QUERY), apply: setPrefersReducedMotion },
    ]
    const updates = subscriptions.map(({ media, apply }) => {
      const update = () => apply(media.matches)
      media.addEventListener?.('change', update)
      return { media, update }
    })
    return () => {
      updates.forEach(({ media, update }) => media.removeEventListener?.('change', update))
    }
  }, [])

  const { data: globalConfig } = useQuery<GlobalConfigDTO>({
    queryKey: ['global-config'],
    queryFn: api.getGlobalConfig,
  })

  const { data: environments = [], isFetching: envsFetching, isSuccess: environmentsLoaded } = useQuery({
    queryKey: ['environments'],
    queryFn: api.getEnvironments,
  })

  const { data: groups = [], isFetching: groupsFetching, isPending: groupsPending } = useQuery<GroupDTO[]>({
    queryKey: ['groups', selectedEnvId],
    queryFn: api.getGroups,
    enabled: selectedEnvId !== undefined,
  })

  const queryClient = useQueryClient()

  /* DB-backed analytics datasets: poll the sync signal until the backend
     reports a completed sync, so fresh data appears without a page refresh. */
  useScopeRefresh({ envId: selectedEnvId, groupId: selectedGroupId })
  useSyncRefresh({ envId: selectedEnvId, groupId: selectedGroupId })

  /* Group ids actually observed per environment (id -> display name). Guards a
     refetch returning a partial/stale dataset from clearing the selection of
     an environment we already know has groups. */
  const knownGroupsRef = useRef(new Map<number, Map<number, string>>())
  const latestSelectionRef = useRef({ environments, groups, selectedGroupId, selectedEnvId })
  latestSelectionRef.current = { environments, groups, selectedGroupId, selectedEnvId }

  const commitGroupSelection = useCallback((envId: number | undefined, groupId: number | undefined) => {
    setSelectedGroupIdState(groupId)
    try {
      if (groupId !== undefined) {
        localStorage.setItem('gcd_selected_group_id', String(groupId))
        if (envId !== undefined) localStorage.setItem(groupStorageKeyFor(envId), String(groupId))
      } else {
        localStorage.removeItem('gcd_selected_group_id')
        if (envId !== undefined) localStorage.removeItem(groupStorageKeyFor(envId))
      }
    } catch { /* ignore */ }
  }, [])

  const handleEnvSelection = useCallback(
    (id: number) => {
      const latest = latestSelectionRef.current
      const env = latest.environments.find((e: EnvironmentDTO) => e.id === id)
      const nextGroupId =
        resolveGroupForEnv(env, latest.groups, latest.selectedGroupId, knownGroupsRef.current.get(id))
        ?? seedDefaultGroup(env)
      setSelectedEnvId(id)
      commitGroupSelection(id, nextGroupId)
      try {
        localStorage.setItem('gcd_selected_env_id', String(id))
      } catch { /* ignore */ }
    },
    [commitGroupSelection],
  )

  /* Restore a valid environment, otherwise prefer default, then first enabled.
     While a refetch is in flight (e.g. right after a create invalidates the
     list), a stale list must not evict a selection the fresh list will keep. */
  useEffect(() => {
    if (environments.length === 0) return
    const valid = environments.find((e: EnvironmentDTO) => e.id === selectedEnvId && e.enabled)
    if (valid) return
    if (envsFetching) return
    const fallback = environments.find((e: EnvironmentDTO) => e.enabled && e.is_default)
      ?? environments.find((e: EnvironmentDTO) => e.enabled)
    if (fallback) handleEnvSelection(fallback.id)
  }, [environments, selectedEnvId, envsFetching, handleEnvSelection])

  const currentEnv = environments.find((e: EnvironmentDTO) => e.id === selectedEnvId)

  /* A group belongs to the environment whose namespace_id is encoded in the high
     bits of its federated id (namespace_id << 44 | local_id). `group_ids` holds
     raw GitLab ids, so it must never be compared against federated `group.id`. */
  /* Explicitly configured groups are selectable even when their GitLab path is
     nested. Descendants fetched for analytics stay out of the picker unless
     their native id is present in the environment configuration. */
  const availableGroups = currentEnv
    ? groupsForEnvironment(groups, currentEnv.namespace_id).filter((group) =>
        (currentEnv.group_ids ?? []).includes(groupLocalId(group.id)),
      )
    : []

  /* Keep a valid group for the active environment; clear a selection left over
     from another environment once this one is known to have no groups. A
     partial or stale dataset (still loading, or missing this env's groups)
     never replaces a selection we already know. */
  useEffect(() => {
    if (!currentEnv) return
    const known = knownGroupsRef.current.get(currentEnv.id) ?? new Map<number, string>()
    availableGroups.forEach((group) => known.set(group.id, group.name))
    knownGroupsRef.current.set(currentEnv.id, known)

    const selectionValid =
      selectedGroupId !== undefined &&
      (availableGroups.some((group) => group.id === selectedGroupId) ||
        known.get(selectedGroupId) !== undefined)

    if (groupsFetching) {
      /* Fast path before the live /api/groups list resolves: an environment that
         defines its own groups can pick a default straight from the DB (its
         configured group_ids), so login / container restart shows a selection
         immediately instead of waiting for the cold GitLab-backed fetch. */
      if (!selectionValid) {
        const seeded = seedDefaultGroup(currentEnv)
        if (seeded !== undefined && seeded !== selectedGroupId) {
          commitGroupSelection(currentEnv.id, seeded)
        }
      }
      return
    }

    if (availableGroups.length === 0 && known.size > 0) return
    const next =
      resolveGroupForEnv(currentEnv, groups, selectedGroupId, known) ??
      (availableGroups.length === 0 ? seedDefaultGroup(currentEnv) : undefined)
    if (next === selectedGroupId) return
    commitGroupSelection(currentEnv.id, next)
  }, [currentEnv, groups, groupsFetching, selectedGroupId, availableGroups, commitGroupSelection])

  const setSelectedGroup = useCallback(
    (id: number) => {
      setSelectedGroupIdState(id)
      try {
        localStorage.setItem('gcd_selected_group_id', String(id))
        const envId = latestSelectionRef.current.selectedEnvId
        if (envId !== undefined) localStorage.setItem(groupStorageKeyFor(envId), String(id))
      } catch { /* ignore */ }
    },
    [],
  )

  const handleUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') {
      api.logout().catch(() => {})
      localStorage.removeItem('user_role')
      localStorage.removeItem('user_username')
      localStorage.removeItem('gcd_selected_env_id')
      localStorage.removeItem('gcd_selected_group_id')
      Object.keys(localStorage)
        .filter((key) => key.startsWith('gcd_selected_group_id_'))
        .forEach((key) => localStorage.removeItem(key))
      if (onLogout) {
        onLogout()
      }
    }
  }

  const settingsTabs = isAdmin ? SETTINGS_TABS : []

  /* SETTINGS section: the only expandable sidebar section. A fresh session
     opens by default (so it is revealed when a child route is active on
     initial load); a manual collapse persists across re-renders, navigation,
     and refresh and is never re-opened by an active child route. */
  const [settingsOpen, setSettingsOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('feature_menu_settings_open') !== 'false'
    } catch {
      return true
    }
  })

  const toggleSettingsSection = useCallback(() => {
    setSettingsOpen((open) => {
      const next = !open
      try { localStorage.setItem('feature_menu_settings_open', String(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed
      try { localStorage.setItem('feature_menu_collapsed', String(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  /* ── Temporary sidebar overlay (hover/focus expansion) ──
     The collapsed rail stays in normal flow at its narrow width; the overlay
     is an absolutely-positioned duplicate that slides over the page content
     and never changes the persisted collapsed/pinned state. */

  const cancelOverlayClose = useCallback(() => {
    if (overlayCloseTimer.current !== null) {
      window.clearTimeout(overlayCloseTimer.current)
      overlayCloseTimer.current = null
    }
  }, [])

  const closeOverlayNow = useCallback(() => {
    cancelOverlayClose()
    focusInsideRef.current = false
    setOverlayOpen(false)
  }, [cancelOverlayClose])

  const openOverlay = useCallback(() => {
    if (!sidebarCollapsed || !overlayCapable) return
    cancelOverlayClose()
    setOverlayOpen(true)
  }, [sidebarCollapsed, overlayCapable, cancelOverlayClose])

  const scheduleOverlayClose = useCallback(() => {
    cancelOverlayClose()
    overlayCloseTimer.current = window.setTimeout(() => {
      overlayCloseTimer.current = null
      if (focusInsideRef.current) return
      setOverlayOpen(false)
    }, OVERLAY_CLOSE_DELAY_MS)
  }, [cancelOverlayClose])

  const handleSidebarPointerEnter = useCallback(() => {
    openOverlay()
  }, [openOverlay])

  const handleSidebarPointerLeave = useCallback(() => {
    scheduleOverlayClose()
  }, [scheduleOverlayClose])

  const handleSidebarFocusIn = useCallback(() => {
    if (!sidebarCollapsed || !overlayCapable) return
    focusInsideRef.current = true
    openOverlay()
  }, [sidebarCollapsed, overlayCapable, openOverlay])

  const handleSidebarFocusOut = useCallback(
    (event: ReactFocusEvent<HTMLElement>) => {
      const related = event.relatedTarget as Node | null
      const slot = sidebarSlotRef.current
      if (related && slot && slot.contains(related)) return
      focusInsideRef.current = false
      scheduleOverlayClose()
    },
    [scheduleOverlayClose],
  )

  /* A permanent expand/collapse (or capability change) drops the overlay. */
  useEffect(() => {
    focusInsideRef.current = false
    cancelOverlayClose()
    setOverlayOpen(false)
  }, [sidebarCollapsed, overlayCapable, cancelOverlayClose])

  useEffect(() => () => cancelOverlayClose(), [cancelOverlayClose])

  useEffect(() => {
    if (!overlayOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      closeOverlayNow()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [overlayOpen, closeOverlayNow])

  const handleLogoExpand = useCallback(() => {
    closeOverlayNow()
    toggleSidebar()
  }, [closeOverlayNow, toggleSidebar])

  /* Pin from the temporary overlay: permanently expands the sidebar using the
     same persisted state and stops propagation so the brand-row expand handler
     never fires a second time. */
  const handlePinSidebar = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      event.stopPropagation()
      closeOverlayNow()
      setSidebarCollapsed(false)
      try {
        localStorage.setItem('feature_menu_collapsed', 'false')
      } catch {
        // ignore
      }
    },
    [closeOverlayNow],
  )

  const handleNavigateTo = useCallback(
    (path: string) => {
      navigate(path)
      closeOverlayNow()
    },
    [navigate, closeOverlayNow],
  )

  const handleOpenEnvSelector = useCallback(() => {
    closeOverlayNow()
    setEnvSelectorOpen(true)
  }, [closeOverlayNow])

  const handleOpenGroupsModal = useCallback(() => {
    closeOverlayNow()
    setGroupsModalOpen(true)
  }, [closeOverlayNow])

  const renderLogoButton = () => (
    <Button
      type="text"
      className="sidebar-brand-expand"
      aria-label="Expand sidebar"
      title="Expand sidebar"
      onClick={handleLogoExpand}
    >
      <PushpinOutlined style={{ fontSize: 16 }} />
    </Button>
  )

  /* Sidebar label: the selected group's name, falling back to a name we
     already observed for it so a stale dataset cannot blank the label. */
  const selectedGroupLabel =
    availableGroups.find((group) => group.id === selectedGroupId)?.name ??
    (selectedGroupId !== undefined && currentEnv
      ? knownGroupsRef.current.get(currentEnv.id)?.get(selectedGroupId)
      : undefined)

  const renderContentState = (node: ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      {node}
    </div>
  )

  const renderMainContent = () => {
    if (environmentsLoaded && environments.length === 0 && location.pathname !== '/environments') {
      return (
        <div className="first-environment-empty-state">
          <CloudServerOutlined />
          <h2>Connect your first GitLab environment</h2>
          <p>No GitLab environment is configured yet. Add an instance and select its groups to begin collecting pipeline and runner analytics.</p>
          <ol>
            <li>Enter the GitLab URL and a read-capable access token.</li>
            <li>Add one or more group IDs, separated by commas.</li>
            <li>Save the environment; synchronization starts automatically.</li>
          </ol>
          <Button type="primary" size="large" icon={<CloudServerOutlined />} onClick={() => navigate('/environments')}>
            Configure GitLab environment
          </Button>
        </div>
      )
    }
    const routeRequiresGroup = ALL_TABS.some((tab) => tab.id === location.pathname)
    if (!routeRequiresGroup || !currentEnv) return <Outlet />
    const known = knownGroupsRef.current.get(currentEnv.id)
    if (
      !groupsFetching &&
      (currentEnv.group_ids ?? []).length === 0 &&
      availableGroups.length === 0 &&
      (known?.size ?? 0) === 0
    ) {
      return renderContentState(
        <Empty description="No groups available for this environment." />,
      )
    }
    /* While the live group list is still loading: show the page once a seeded
       group is active (DB-backed, available immediately) or the environment is
       known to own no groups. An environment with no persisted selection and
       no known-group evidence still shows the spinner until the list settles. */
    if (groupsPending || groupsFetching) {
      const canProceed =
        selectedGroupId !== undefined ||
        (availableGroups.length === 0 && (currentEnv.group_ids ?? []).length === 0)
      if (!canProceed) return renderContentState(<Spin />)
    }
    const selectionKnown =
      selectedGroupId !== undefined &&
      (availableGroups.some((group) => group.id === selectedGroupId) ||
        known?.get(selectedGroupId) !== undefined)
    if (!groupsFetching && availableGroups.length > 0 && !selectionKnown) {
      return renderContentState(<Spin />)
    }
    return <Outlet />
  }

  const renderSidebarContent = (mode: SidebarMode) => {
    const withLabels = mode !== 'rail'
    return (
      <>
        <div className="sidebar-brand">
          {mode === 'rail' ? (
            renderLogoButton()
          ) : (
            <>
              {mode === 'overlay' ? (
                <Button
                  type="text"
                  className="sidebar-brand-expand sidebar-brand-expand--overlay"
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                  onClick={handleLogoExpand}
                >
                  <Text strong className="sidebar-theme-title">AndJoy GitOps</Text>
                </Button>
              ) : null}
              {mode === 'expanded' && (
                <>
                  <Text strong className="sidebar-theme-title">AndJoy GitOps</Text>
                    <Button
                      type="text"
                      className="sidebar-pin sidebar-pin--pinned"
                      icon={<PushpinFilled />}
                      aria-label="Unpin sidebar"
                      title="Unpin sidebar"
                      onClick={toggleSidebar}
                    />
                </>
              )}
              {mode === 'overlay' && (
                <Button
                  type="text"
                    className="sidebar-pin sidebar-pin--overlay sidebar-pin--unpinned"
                    icon={<PushpinOutlined />}
                  aria-label="Pin sidebar"
                  title="Pin sidebar"
                  onClick={handlePinSidebar}
                />
              )}
            </>
          )}
        </div>

        <div className="sidebar-section">
          {withLabels && <Text className="sidebar-section-label">ENVIRONMENT</Text>}
          <Button
            block
            type="text"
            icon={<FolderMark style={{ width: 16, height: 16 }} />}
            onClick={handleOpenEnvSelector}
            style={{
              justifyContent: 'flex-start',
              color: 'var(--dashboard-text)',
            }}
            title={currentEnv?.name || 'No environment'}
          >
            {withLabels && (
              <span className="sidebar-item-label">{currentEnv?.name || 'No environment'}</span>
            )}
          </Button>
        </div>

        <div className="sidebar-section">
          {withLabels && <Text className="sidebar-section-label">GROUP</Text>}
          <Button
            block
            type="text"
            icon={<FolderMark style={{ width: 16, height: 16 }} />}
            onClick={handleOpenGroupsModal}
            style={{
              justifyContent: 'flex-start',
              color: 'var(--dashboard-text)',
            }}
            title={selectedGroupLabel || 'Select group'}
          >
            {withLabels && (
              <span className="sidebar-item-label">
                {selectedGroupLabel || 'Select group'}
              </span>
            )}
          </Button>
        </div>

        <div className="sidebar-section">
          {withLabels && <Text className="sidebar-section-label">DASHBOARD</Text>}
          {ALL_TABS.map((tab) => (
            <Button
              key={tab.id}
              block
              type={location.pathname === tab.id ? 'primary' : 'text'}
              icon={tab.icon}
              onClick={() => handleNavigateTo(tab.id)}
              style={{ justifyContent: 'flex-start' }}
              title={tab.label}
            >
              {withLabels && <span className="sidebar-item-label">{tab.label}</span>}
            </Button>
          ))}
        </div>

        {settingsTabs.length > 0 && (
          <div className="sidebar-section">
            <button
              type="button"
              className="sidebar-section-toggle"
              aria-expanded={settingsOpen}
              aria-label="SETTINGS"
              onClick={toggleSettingsSection}
            >
              {withLabels && <span className="sidebar-section-toggle-label">SETTINGS</span>}
              <RightOutlined className="sidebar-section-chevron" aria-hidden />
            </button>
            <div className="settings-children">
              <div className="settings-children-inner">
                {settingsTabs.map((tab) => {
                  const button = (
                    <Button
                    key={tab.id}
                    block
                    type={location.pathname === tab.id ? 'primary' : 'text'}
                    icon={tab.icon}
                    className={tab.id === '/environments' && environments.length === 0
                      ? 'sidebar-environment-onboarding'
                      : undefined}
                    onClick={() => {
                      if (tab.id === '/environments') setEnvironmentHintOpen(false)
                      handleNavigateTo(tab.id)
                    }}
                    style={{ justifyContent: 'flex-start' }}
                    title={tab.label}
                  >
                    {settingsOpen && withLabels && <span className="sidebar-item-label">{tab.label}</span>}
                  </Button>
                  )
                  if (tab.id !== '/environments' || environments.length > 0 || !withLabels) {
                    return button
                  }
                  return (
                    <Popover
                      key={tab.id}
                      open={environmentHintOpen}
                      onOpenChange={setEnvironmentHintOpen}
                      placement="right"
                      rootClassName="environment-onboarding-popover"
                      title="Start here"
                      content="Add your first GitLab environment to begin collecting analytics."
                    >
                      {button}
                    </Popover>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </>
    )
  }


  return (
    <GroupContext.Provider
        value={{
          selectedGroupId,
          setSelectedGroupId: setSelectedGroup,
          selectedEnvId,
          envNamespaceId: currentEnv?.namespace_id,
          selectEnvironment: handleEnvSelection,
          selectedEnvBaseUrl: currentEnv?.base_url,
        }}
    >
      <div className="shell-layout">
        <Header companyName={globalConfig?.company_name} companyLogo={globalConfig?.company_logo}>
          <Space style={{ marginLeft: 'auto' }}>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: 'Sign out',
                  },
                ],
                onClick: handleUserMenuClick,
              }}
              placement="bottomRight"
              overlayClassName="header-user-dropdown"
            >
              <Button type="text" icon={<UserOutlined />}>
                {sessionUsername || 'User'}
              </Button>
            </Dropdown>
          </Space>
        </Header>

        <div className="shell-body">
          <div
            className={`shell-sidebar-slot${sidebarCollapsed ? ' shell-sidebar-slot-collapsed' : ''}`}
            ref={sidebarSlotRef}
          >
            <aside
              className={`shell-sidebar${sidebarCollapsed ? ' shell-sidebar-collapsed' : ''}`}
              onPointerEnter={handleSidebarPointerEnter}
              onPointerLeave={handleSidebarPointerLeave}
              onFocus={handleSidebarFocusIn}
              onBlur={handleSidebarFocusOut}
            >
              {renderSidebarContent(sidebarCollapsed ? 'rail' : 'expanded')}
            </aside>

            {sidebarCollapsed && overlayCapable && (
              <div
                className={[
                  'shell-sidebar',
                  'shell-sidebar-overlay',
                  overlayOpen ? 'is-open' : '',
                  prefersReducedMotion ? 'is-reduced-motion' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                inert={!overlayOpen}
                onPointerEnter={handleSidebarPointerEnter}
                onPointerLeave={handleSidebarPointerLeave}
                onFocus={handleSidebarFocusIn}
                onBlur={handleSidebarFocusOut}
              >
                {renderSidebarContent('overlay')}
              </div>
            )}
          </div>

          <main className="shell-content">
            {renderMainContent()}
          </main>
        </div>

        <Modal open={envSelectorOpen} title="Select Environment" footer={null}
          onCancel={() => setEnvSelectorOpen(false)} width={480} centered
          rootClassName="theme-selector-modal">
          <Space direction="vertical" style={{ width: '100%' }}>
            {environments.filter((env: EnvironmentDTO) => env.enabled).map((env: EnvironmentDTO) => (
              <Button key={env.id} block type={env.id === selectedEnvId ? 'primary' : 'default'}
                className={`theme-selector-environment${env.id === selectedEnvId ? ' is-selected' : ''}`}
                onClick={() => { handleEnvSelection(env.id); setEnvSelectorOpen(false) }}>
                {env.name} {env.is_default && <Tag color="gold">Default</Tag>}
              </Button>
            ))}
          </Space>
        </Modal>

        <GroupSelectorModal
          open={groupsModalOpen}
          onClose={() => setGroupsModalOpen(false)}
          selectedGroupId={selectedGroupId}
          onSelect={(id) => {
            setSelectedGroup(id)
          }}
          groups={availableGroups}
        />
      </div>
    </GroupContext.Provider>
  )
}
