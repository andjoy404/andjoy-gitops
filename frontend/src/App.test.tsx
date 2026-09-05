import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { stubMatchMedia, stubGetComputedStyle } from './test-utils/test-helpers'

vi.mock('./services/api', () => ({
  api: {
    getAuthStatus: vi.fn(),
    getGlobalConfig: vi.fn().mockResolvedValue({
      company_name: 'AndJoy GitOps',
      company_logo: '',
    }),
    getEnvironments: vi.fn().mockResolvedValue([]),
    getGroups: vi.fn().mockResolvedValue([]),
    getAnalyticsReadiness: vi.fn().mockResolvedValue({
      ready: true,
      data_available: false,
      message: '',
      last_completed_at: null,
      project_count: 0,
      pipeline_count: 0,
      runner_state_count: 0,
      user_count: 0,
      user_event_count: 0,
      user_issue_count: 0,
    }),
    logout: vi.fn(),
  },
  queryClient: vi.fn(),
}))

import { api } from './services/api'
import App from './App'
import { federatedGroupId } from './utils/federated'

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>,
  )
}

describe('App', () => {
  // App component renders a loading state initially — cannot easily test
  // the full routing logic without mocking fetch, but we can at least
  // verify the module loads without crashing
  it('module loads without crashing', () => {
    expect(() => {
      render(
        <div className="app-loading" />,
      )
    }).not.toThrow()
  })
})

describe('App — session role persistence', () => {
  beforeEach(() => {
    stubMatchMedia()
    stubGetComputedStyle()
    cleanup()
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('persists the auth status role normalized and shows the admin menus after loading resolves', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValueOnce({
      authenticated: true,
      username: 'admin',
      role: 'ADMIN',
      must_change_password: false,
    })

    renderApp()

    // The initial loading state must not permanently hide the entries:
    // once the role resolves, the admin menus appear.
    const configurationsButton = (await screen.findByText('Configurations', { timeout: 5000 })).closest('button')
    expect(configurationsButton).toBeInTheDocument()
    expect(screen.getByText('Users').closest('button')).toBeInTheDocument()
    expect(screen.getByText('Environments').closest('button')).toBeInTheDocument()
    expect(localStorage.getItem('user_role')).toBe('admin')
  })

  it('does not expose admin menus to a non-admin session', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValueOnce({
      authenticated: true,
      username: 'dev',
      role: 'editor',
      must_change_password: false,
    })

    renderApp()

    const dashboardButton = (await screen.findByText('Dashboard', { timeout: 5000 })).closest('button')
    expect(dashboardButton).toBeInTheDocument()
    expect(screen.queryByText('Users')?.closest('button') ?? null).toBeNull()
    expect(screen.queryByText('Environments')?.closest('button') ?? null).toBeNull()
    expect(screen.queryByText('Configurations')?.closest('button') ?? null).toBeNull()
    expect(localStorage.getItem('user_role')).toBe('editor')
  })

  it('primes the default environment and group before rendering Dashboard', async () => {
    window.location.hash = '#/'
    vi.mocked(api.getAuthStatus).mockResolvedValueOnce({
      authenticated: true,
      username: 'admin',
      role: 'admin',
      must_change_password: false,
    })
    vi.mocked(api.getEnvironments).mockResolvedValueOnce([{
      id: 9,
      namespace_id: 2,
      name: 'Primary GitLab',
      base_url: 'https://gitlab.example.com',
      group_ids: [42],
      enabled: true,
      only_top_level: true,
      include_subgroups: true,
      token_configured: true,
      last_tested_at: null,
      last_error: null,
      is_default: true,
    }])

    renderApp()

    expect(await screen.findByText('Analytics overview')).toBeInTheDocument()
    expect(localStorage.getItem('gcd_selected_env_id')).toBe('9')
    expect(localStorage.getItem('gcd_selected_group_id')).toBe(String(federatedGroupId(2, 42)))
  })
})

describe('App — stored theme preference', () => {
  beforeEach(() => {
    stubMatchMedia()
    stubGetComputedStyle()
    cleanup()
    localStorage.clear()
    document.documentElement.classList.remove('dark-theme')
    vi.clearAllMocks()
  })

  it('applies the stored dark theme once the session resolves', async () => {
    localStorage.setItem('theme', 'dark')
    vi.mocked(api.getAuthStatus).mockResolvedValueOnce({
      authenticated: true,
      username: 'admin',
      role: 'ADMIN',
      must_change_password: false,
    })

    renderApp()

    await screen.findByText('Dashboard', { timeout: 5000 })
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark-theme')).toBe(true)
    })
  })

  it('keeps the theme class while unauthenticated so Login stays dark', async () => {
    document.documentElement.classList.add('dark-theme')
    vi.mocked(api.getAuthStatus).mockResolvedValueOnce({
      authenticated: false,
    })

    renderApp()

    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
    expect(document.documentElement.classList.contains('dark-theme')).toBe(true)
  })
})
