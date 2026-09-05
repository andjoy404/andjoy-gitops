import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from './services/api'
import Login from './pages/Login'
import PasswordChangeModal from './components/PasswordChangeModal'
import Shell from './components/Shell'
import ErrorBoundary from './components/ErrorBoundary'
import EnvironmentsPage from './pages/EnvironmentsPage'
import GlobalConfigPage from './pages/GlobalConfigPage'
import type { AuthStatus, EnvironmentDTO } from './types'
import { persistSessionRole, persistSessionUsername } from './utils/role'
import { applyThemeClass } from './hooks/useTheme'
import { federatedGroupId } from './utils/federated'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const PipelinesPage = lazy(() => import('./pages/PipelinesPage'))
const UserActivityPage = lazy(() => import('./pages/UserActivityPage'))
const RelationsMapPage = lazy(() => import('./pages/RelationsMapPage'))
const RunnersPage = lazy(() => import('./pages/RunnersPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))

const groupStorageKeyFor = (envId: number): string => `gcd_selected_group_id_${envId}`

function persistedNumber(key: string): number | undefined {
  const value = Number.parseInt(localStorage.getItem(key) ?? '', 10)
  return Number.isFinite(value) ? value : undefined
}

/* Resolve the environment and group before Shell mounts. This keeps the first
   authenticated paint stable instead of briefly rendering an empty scope and
   repairing it later after the environments query resolves. */
async function primeWorkspaceSelection(
  fetchEnvironments: () => Promise<EnvironmentDTO[]>,
): Promise<void> {
  const environments = await fetchEnvironments()
  const enabled = environments.filter((environment) => environment.enabled)
  if (enabled.length === 0) {
    localStorage.removeItem('gcd_selected_env_id')
    localStorage.removeItem('gcd_selected_group_id')
    return
  }

  const storedEnvId = persistedNumber('gcd_selected_env_id')
  const environment = enabled.find((candidate) => candidate.id === storedEnvId)
    ?? enabled.find((candidate) => candidate.is_default)
    ?? enabled[0]
  localStorage.setItem('gcd_selected_env_id', String(environment.id))

  const storedGroupId = persistedNumber(groupStorageKeyFor(environment.id))
  const defaultGroupId = environment.group_ids?.[0] !== undefined
    ? federatedGroupId(environment.namespace_id, environment.group_ids[0])
    : undefined
  const groupId = storedGroupId ?? defaultGroupId
  if (groupId !== undefined) {
    localStorage.setItem('gcd_selected_group_id', String(groupId))
    localStorage.setItem(groupStorageKeyFor(environment.id), String(groupId))
  } else {
    localStorage.removeItem('gcd_selected_group_id')
  }
}

function AppContent() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [authState, setAuthState] = useState<{
    authenticated: boolean
    mustChangePassword: boolean
    loading: boolean
  }>({ authenticated: false, mustChangePassword: false, loading: true })

  const [proceeding, setProceeding] = useState(false)

  const handlePasswordChange = () => {
    setProceeding(true)
  }

  const handleSuccessfulLogin = async (loginData: AuthStatus) => {
    persistSessionRole(loginData.role)
    persistSessionUsername(loginData.username)
    primeWorkspaceSelection(() => queryClient.fetchQuery({
      queryKey: ['environments'],
      queryFn: api.getEnvironments,
      staleTime: 60_000,
    })).catch(() => { /* Shell retains the previous selection on transient failure. */ })
    setAuthState({
      authenticated: true,
      mustChangePassword: loginData.must_change_password,
      loading: false,
    })
    // Refetch to verify session and update stale mustChangePassword
    api.getAuthStatus().catch(() => {
      // If verification fails, state stays from login data
    })
  }

  const handleLogout = () => {
    setAuthState({ authenticated: false, mustChangePassword: false, loading: false })
    api.logout().catch(() => {})
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    let cancelled = false
    const checkAuth = async () => {
      try {
        const data = await api.getAuthStatus()
        if (cancelled) return
        if (data.authenticated) {
          persistSessionRole(data.role)
          persistSessionUsername(data.username)
          await primeWorkspaceSelection(() => queryClient.fetchQuery({
            queryKey: ['environments'],
            queryFn: api.getEnvironments,
            staleTime: 60_000,
          })).catch(() => { /* Preserve persisted scope when bootstrap is unavailable. */ })
          if (cancelled) return
        }
        setAuthState({
          authenticated: data.authenticated,
          mustChangePassword: data.must_change_password,
          loading: false,
        })
      } catch {
        if (cancelled) return
        setAuthState({ authenticated: false, mustChangePassword: false, loading: false })
      }
    }
    checkAuth()
    return () => { cancelled = true }
  }, [queryClient])

  /* Apply the stored theme as soon as a session is authenticated so deep
     links render with the right theme on first paint. The class is left in
     place while unauthenticated, matching the previous toggle behavior. */
  useEffect(() => {
    if (!authState.loading && authState.authenticated) {
      applyThemeClass()
    }
  }, [authState.loading, authState.authenticated])

  if (authState.loading) {
    return <div className="app-loading" />
  }

  if (!authState.authenticated) {
    return <Login onSuccessfulLogin={handleSuccessfulLogin} />
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route
        path="/"
        element={
          authState.mustChangePassword && !proceeding ? (
            <PasswordChangeModal
              open={authState.mustChangePassword}
              onClose={handlePasswordChange}
            />
          ) : (
            <Shell onLogout={handleLogout} />
          )
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={
          <Suspense fallback={<div className="app-loading" />}>
            <ErrorBoundary><DashboardPage /></ErrorBoundary>
          </Suspense>
        } />
        <Route path="pipelines" element={
          <Suspense fallback={<div className="app-loading" />}>
            <ErrorBoundary><PipelinesPage /></ErrorBoundary>
          </Suspense>
        } />
        <Route path="runners" element={
          <Suspense fallback={<div className="app-loading" />}>
            <ErrorBoundary><RunnersPage /></ErrorBoundary>
          </Suspense>
        } />
        <Route path="user-activity" element={
          <Suspense fallback={<div className="app-loading" />}>
            <ErrorBoundary><UserActivityPage /></ErrorBoundary>
          </Suspense>
        } />
        <Route path="relations-map" element={
          <Suspense fallback={<div className="app-loading" />}>
            <ErrorBoundary><RelationsMapPage /></ErrorBoundary>
          </Suspense>
        } />
        <Route path="users" element={<UsersPage />} />
        <Route path="environments" element={<EnvironmentsPage />} />
        <Route path="global-config" element={<GlobalConfigPage />} />
        <Route path="*" element={<Outlet />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return <AppContent />
}
