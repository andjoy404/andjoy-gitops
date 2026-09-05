import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { stubMatchMedia, stubGetComputedStyle } from '../test-utils/test-helpers'
import { api } from '../services/api'
import type { EnvironmentDTO, GroupDTO } from '../types'
import Shell from './Shell'

vi.mock('../services/api', () => ({
  api: {
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

beforeEach(() => {
  stubMatchMedia()
  stubGetComputedStyle()
  cleanup()
  vi.clearAllMocks()
  localStorage.clear()
})

describe('Shell component — Header theme toggle count', () => {
  it('renders no theme toggle in the header (theme selection moved to Global Config)', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <Shell />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const allButtons = container.querySelectorAll('button')
    const themeButtons = Array.from(allButtons).filter(
      (btn) => btn.getAttribute('aria-label') === 'Toggle theme',
    )
    expect(themeButtons.length).toBe(0)

    // Header actions remain intact where the toggle used to be. The
    // accessible name includes the user icon's aria-label ("user"); the
    // GitHub action is an anchor (antd Button with href) so its role is link.
    expect(screen.getByRole('button', { name: 'user User' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /gitlab ops repository on github/i })).toBeInTheDocument()
  })

  it('collapses the left menu with the pin button and persists the choice', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}><Shell /></MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Unpin sidebar' }))

    expect(container.querySelector('.shell-sidebar')).toHaveClass('shell-sidebar-collapsed')
    expect(container.querySelector('.sidebar-pin')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unpin sidebar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
    expect(localStorage.getItem('feature_menu_collapsed')).toBe('true')
  })
})

describe('Shell component — sidebar brand', () => {
  function renderShell() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <Shell />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('shows the AndJoy GitOps name without an icon when expanded', () => {
    const { container } = renderShell()
    const brand = container.querySelector('.sidebar-brand')!

    expect(brand.querySelector('img')).toBeNull()
    expect(brand.querySelector('.sidebar-theme-title')).toHaveTextContent('AndJoy GitOps')
  })

  it('never takes the brand from the global company config', async () => {
    vi.mocked(api.getGlobalConfig).mockResolvedValueOnce({
      company_name: 'Acme Corp',
      company_logo: 'https://acme.test/logo.png',
      pipeline_view: 'latest',
    })

    const { container } = renderShell()

    // The config is loaded and reflected in the header…
    await screen.findByText('Acme Corp')
    const brand = container.querySelector('.sidebar-brand')!

    // …but the sidebar brand stays the static AndJoy GitOps name.
    expect(brand.querySelector('.sidebar-theme-title')).toHaveTextContent('AndJoy GitOps')
    expect(brand.querySelector('img')).toBeNull()
  })

  it('keeps the logo visible inside a labelled expand control when collapsed', () => {
    const { container } = renderShell()

    fireEvent.click(screen.getByRole('button', { name: 'Unpin sidebar' }))
    expect(container.querySelector('.shell-sidebar')).toHaveClass('shell-sidebar-collapsed')

    const expandButton = screen.getByRole('button', { name: 'Expand sidebar' })
    const logo = expandButton.querySelector('img')
    expect(logo).toBeInTheDocument()
    expect(logo!.getAttribute('alt')).toBe('AndJoy GitOps')
    expect(expandButton).toHaveAttribute('title', 'Expand sidebar')
    expect(container.querySelector('.sidebar-brand .sidebar-theme-title')).toBeNull()
  })
})

describe('Shell component — sidebar collapse/expand interaction', () => {
  function renderShellCollapsedAt(path = '/dashboard') {
    localStorage.setItem('feature_menu_collapsed', 'true')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Shell />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('removes the pin while collapsed — the logo is the only brand control', () => {
    localStorage.setItem('feature_menu_collapsed', 'true')
    const { container } = renderShellCollapsedAt()

    expect(container.querySelector('.shell-sidebar')).toHaveClass('shell-sidebar-collapsed')
    expect(container.querySelector('.sidebar-pin')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unpin sidebar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand left menu' })).not.toBeInTheDocument()

    const expandButton = screen.getByRole('button', { name: 'Expand sidebar' })
    expect(expandButton).toHaveAttribute('aria-label', 'Expand sidebar')
    expect(expandButton).toHaveAttribute('title', 'Expand sidebar')
    expect(expandButton.querySelector('img')).toHaveAttribute('alt', 'AndJoy GitOps')
    expect(expandButton.querySelector('img')!.getAttribute('src')).toContain('andjoy-gitops-logo')
  })

  it('expands the sidebar when the collapsed logo is clicked and persists the choice', () => {
    const { container } = renderShellCollapsedAt()

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))

    expect(container.querySelector('.shell-sidebar')).not.toHaveClass('shell-sidebar-collapsed')
    expect(screen.getByRole('button', { name: 'Unpin sidebar' })).toBeInTheDocument()
    expect(container.querySelector('.sidebar-pin')).toBeInTheDocument()
    expect(container.querySelector('.sidebar-brand .sidebar-theme-title')).toHaveTextContent('AndJoy GitOps')
    expect(localStorage.getItem('feature_menu_collapsed')).toBe('false')
  })

  it('supports Enter and Space by rendering a native button, not a click-only div', () => {
    const { container } = renderShellCollapsedAt()

    const expandButton = screen.getByRole('button', { name: 'Expand sidebar' }) as HTMLButtonElement
    // A native <button> receives Enter (keydown) and Space (keyup) activation from
    // the browser. jsdom does not synthesize that activation into a click, so the
    // semantic control type is what guarantees keyboard support here.
    expect(expandButton.tagName).toBe('BUTTON')
    expect(container.querySelector('.sidebar-brand-expand')).toBe(expandButton)
    expect(expandButton).toHaveAttribute('aria-label', 'Expand sidebar')
    expect(expandButton).not.toHaveAttribute('disabled')
  })

  it('does not change the route when the logo expands the sidebar', () => {
    renderShellCollapsedAt('/dashboard')

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/dashboard')
  })

  it('restores the expanded preference on refresh (no stored expansion)', () => {
    localStorage.setItem('feature_menu_collapsed', 'false')
    const { container } = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })}
      >
        <MemoryRouter initialEntries={['/dashboard']}>
          <Shell />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(container.querySelector('.shell-sidebar')).not.toHaveClass('shell-sidebar-collapsed')
    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unpin sidebar' })).toBeInTheDocument()
  })
})

describe('Shell component — environment switch group re-resolution', () => {
  const envA: EnvironmentDTO = {
    id: 1, namespace_id: 0, name: 'Env A', base_url: 'https://gitlab-a.test',
    group_ids: [11], enabled: true, only_top_level: false, include_subgroups: true,
    token_configured: true, last_tested_at: null, last_error: null, is_default: true,
  }
  const envB: EnvironmentDTO = {
    id: 2, namespace_id: 1, name: 'Env B', base_url: 'https://gitlab-b.test',
    group_ids: [22], enabled: true, only_top_level: false, include_subgroups: true,
    token_configured: true, last_tested_at: null, last_error: null, is_default: false,
  }
  const envC: EnvironmentDTO = {
    id: 3, namespace_id: 2, name: 'Env C', base_url: 'https://gitlab-c.test',
    group_ids: [], enabled: true, only_top_level: false, include_subgroups: true,
    token_configured: true, last_tested_at: null, last_error: null, is_default: false,
  }
  // /api/groups returns federated ids: (namespace_id << 44) | local_id
  const groupA: GroupDTO = { id: 11, name: 'Group A', full_path: 'group-a' }
  const groupB: GroupDTO = { id: Number((1n << 44n) | 22n), name: 'Group B', full_path: 'group-b' }

  it('re-selects a group from the active environment when switching environments', async () => {
    vi.mocked(api.getEnvironments).mockResolvedValue([envA, envB])
    vi.mocked(api.getGroups).mockResolvedValue([groupA, groupB])
    localStorage.setItem('gcd_selected_env_id', '1')

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Shell />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    // Env A is selected; its only group resolves first.
    expect(await screen.findByText('Group A')).toBeInTheDocument()
    expect(localStorage.getItem('gcd_selected_group_id')).toBe('11')

    // Switch to Env B through the environment selector.
    fireEvent.click(screen.getByText('Env A'))
    fireEvent.click(await screen.findByRole('button', { name: 'Env B' }))

    // Env B's federated group id must become the active selection so every
    // page stops requesting Env A's groups. Currently fails: the raw
    // `group_ids` (22) never match federated `group.id`, so the stale group
    // from Env A is kept.
    await vi.waitFor(() => {
      expect(localStorage.getItem('gcd_selected_group_id')).toBe(String(groupB.id))
    }, { timeout: 1000 })
    expect(await screen.findByText('Group B')).toBeInTheDocument()
  })
})

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{location.pathname}</div>
}

function renderShellAs(role: string | null, path = '/dashboard') {
  if (role !== null) localStorage.setItem('user_role', role)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Shell />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Shell component — admin sidebar sections', () => {
  const navButton = (label: string) => screen.getByText(label).closest('button') as HTMLElement
  const queryNavButton = (label: string) => screen.queryByText(label)?.closest('button') ?? null
  const settingsToggle = () => screen.getByRole('button', { name: 'SETTINGS' }) as HTMLButtonElement

  it('shows the SETTINGS section with its children for an admin session', () => {
    const { container } = renderShellAs('admin')

    expect(screen.getByText('SETTINGS')).toBeInTheDocument()
    expect(settingsToggle()).toHaveAttribute('aria-expanded', 'true')
    // SETTINGS is the only expandable sidebar section.
    expect(container.querySelectorAll('.sidebar-section-toggle')).toHaveLength(1)
    expect(navButton('Users')).toBeInTheDocument()
    expect(navButton('Environments')).toBeInTheDocument()
    expect(navButton('Configurations')).toBeInTheDocument()
  })

  it('normalizes role casing when reading the stored role', () => {
    renderShellAs('ADMIN')

    expect(navButton('Users')).toBeInTheDocument()
    expect(navButton('Environments')).toBeInTheDocument()
    expect(navButton('Configurations')).toBeInTheDocument()
  })

  it('hides the admin-only SETTINGS section for a non-admin session', () => {
    renderShellAs('editor')

    expect(screen.queryByText('SETTINGS')).not.toBeInTheDocument()
    expect(queryNavButton('Users')).toBeNull()
    expect(queryNavButton('Environments')).toBeNull()
    expect(queryNavButton('Configurations')).toBeNull()
    expect(navButton('Dashboard')).toBeInTheDocument()
  })

  it('navigates to the restored routes and highlights the active entry', () => {
    renderShellAs('admin')

    fireEvent.click(navButton('Users'))
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/users')
    expect(navButton('Users')).toHaveClass('ant-btn-primary')

    fireEvent.click(navButton('Environments'))
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/environments')
    expect(navButton('Environments')).toHaveClass('ant-btn-primary')

    fireEvent.click(navButton('Configurations'))
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/global-config')
    expect(navButton('Configurations')).toHaveClass('ant-btn-primary')
  })

  it('toggles SETTINGS children without navigating and persists the state', () => {
    renderShellAs('admin', '/dashboard')

    const toggle = settingsToggle()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle.querySelector('.sidebar-section-chevron')).not.toBeNull()
    expect(navButton('Users')).toBeInTheDocument()

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(queryNavButton('Users')).toBeNull()
    expect(queryNavButton('Environments')).toBeNull()
    expect(queryNavButton('Configurations')).toBeNull()
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/dashboard')
    expect(localStorage.getItem('feature_menu_settings_open')).toBe('false')

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(navButton('Users')).toBeInTheDocument()
    expect(localStorage.getItem('feature_menu_settings_open')).toBe('true')
  })

  it('keeps a manual SETTINGS collapse while a child route stays active', () => {
    renderShellAs('admin', '/users')

    // Initial load with a child route active reveals the section.
    expect(settingsToggle()).toHaveAttribute('aria-expanded', 'true')
    expect(navButton('Users')).toHaveClass('ant-btn-primary')

    fireEvent.click(settingsToggle())

    // The manual collapse sticks even though /users remains the active route.
    expect(settingsToggle()).toHaveAttribute('aria-expanded', 'false')
    expect(queryNavButton('Users')).toBeNull()
    expect(queryNavButton('Environments')).toBeNull()
    expect(queryNavButton('Configurations')).toBeNull()
    expect(localStorage.getItem('feature_menu_settings_open')).toBe('false')
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/users')

    // Toggling re-expands without navigating, and active highlighting survives.
    fireEvent.click(settingsToggle())

    expect(settingsToggle()).toHaveAttribute('aria-expanded', 'true')
    expect(navButton('Users')).toHaveClass('ant-btn-primary')
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/users')
    expect(localStorage.getItem('feature_menu_settings_open')).toBe('true')
  })

  it('keeps the SETTINGS children reachable in the collapsed sidebar', () => {
    const { container } = renderShellAs('admin')

    fireEvent.click(screen.getByRole('button', { name: 'Unpin sidebar' }))
    expect(container.querySelector('.shell-sidebar')).toHaveClass('shell-sidebar-collapsed')
    expect(screen.queryByText('SETTINGS')).not.toBeInTheDocument()
    expect(container.querySelector('.shell-sidebar-collapsed .sidebar-section-toggle')).toBeTruthy()

    const configurationsButton = container.querySelector('button[title="Configurations"]')
    expect(configurationsButton).toBeTruthy()
    fireEvent.click(configurationsButton!)
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/global-config')
  })

  it('keeps the SETTINGS toggle functional in the collapsed-hover overlay', () => {
    localStorage.setItem('feature_menu_collapsed', 'true')
    localStorage.setItem('user_role', 'admin')
    stubMatchMedia((query: string) => query.includes('min-width: 801px'))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Shell />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const rail = container.querySelector<HTMLElement>('.shell-sidebar-slot > aside')!
    fireEvent.focusIn(rail.querySelector<HTMLButtonElement>('button[title="Dashboard"]')!)
    const overlay = container.querySelector<HTMLElement>('.shell-sidebar-overlay')!
    expect(overlay).toHaveClass('is-open')

    const toggle = overlay.querySelector<HTMLButtonElement>('.sidebar-section-toggle')!
    expect(toggle).toBeTruthy()
    expect(overlay.querySelector('button[title="Users"]')).toBeTruthy()

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(overlay.querySelector('button[title="Users"]')).toBeNull()
    expect(overlay).toHaveClass('is-open')

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(overlay.querySelector('button[title="Users"]')).toBeTruthy()
  })
})

describe('Shell temporary overlay — keyboard accessibility', () => {
  function renderCollapsibleShell() {
    localStorage.setItem('feature_menu_collapsed', 'true')
    stubMatchMedia((query: string) => query.includes('min-width: 801px'))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Shell />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  const railOf = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('.shell-sidebar-slot > aside')!
  const overlayOf = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('.shell-sidebar-overlay')
  const railButton = (container: HTMLElement, label: string) =>
    railOf(container).querySelector<HTMLButtonElement>(`button[title="${label}"]`)!

  it('keeps hidden overlay controls unfocusable while fully collapsed', () => {
    const { container } = renderCollapsibleShell()
    const overlay = overlayOf(container)
    expect(overlay, 'collapsed capable sidebar should render the overlay').toBeTruthy()
    expect(overlay).not.toHaveClass('is-open')
    expect(overlay).toHaveAttribute('inert')
    expect(railOf(container).querySelectorAll('button').length).toBeGreaterThan(0)
  })

  it('focusing the collapsed sidebar opens the temporary overlay without persisting', () => {
    const { container } = renderCollapsibleShell()
    fireEvent.focusIn(railButton(container, 'Dashboard'))
    const rail = railOf(container)
    expect(overlayOf(container)).toHaveClass('is-open')
    expect(overlayOf(container)).not.toHaveAttribute('inert')
    expect(rail).toHaveClass('shell-sidebar-collapsed')
    expect(localStorage.getItem('feature_menu_collapsed')).toBe('true')
  })

  it('keeps the overlay open while focus remains inside, then closes after focus leaves', async () => {
    const { container } = renderCollapsibleShell()
    const rail = railOf(container)
    const dashboard = railButton(container, 'Dashboard')
    const pipelines = railButton(container, 'Pipelines')

    fireEvent.focusIn(dashboard)
    expect(overlayOf(container)).toHaveClass('is-open')

    fireEvent.focusOut(dashboard, { relatedTarget: pipelines })
    expect(overlayOf(container)).toHaveClass('is-open')

    fireEvent.focusOut(pipelines, { relatedTarget: document.body })
    await vi.waitFor(() => expect(overlayOf(container)).not.toHaveClass('is-open'), {
      timeout: 1500,
    })
    expect(overlayOf(container)).toHaveAttribute('inert')
    expect(rail).toHaveClass('shell-sidebar-collapsed')
    expect(localStorage.getItem('feature_menu_collapsed')).toBe('true')
  })

  it('closes the temporary overlay on Escape and leaves persistence untouched', () => {
    const { container } = renderCollapsibleShell()
    const rail = railOf(container)
    fireEvent.focusIn(railButton(container, 'Dashboard'))
    expect(overlayOf(container)).toHaveClass('is-open')

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(overlayOf(container)).not.toHaveClass('is-open')
    expect(overlayOf(container)).toHaveAttribute('inert')
    expect(rail).toHaveClass('shell-sidebar-collapsed')
    expect(localStorage.getItem('feature_menu_collapsed')).toBe('true')

    fireEvent.focusIn(railButton(container, 'Pipelines'))
    expect(overlayOf(container)).toHaveClass('is-open')
  })

  it('permanently expands the sidebar when the overlay logo is clicked', () => {
    const { container } = renderCollapsibleShell()
    fireEvent.focusIn(railButton(container, 'Dashboard'))
    fireEvent.click(overlayOf(container)!.querySelector<HTMLButtonElement>('button.sidebar-brand-expand')!)

    expect(overlayOf(container)).toBeNull()
    expect(railOf(container)).not.toHaveClass('shell-sidebar-collapsed')
    expect(railOf(container).querySelector('.sidebar-pin')).toBeTruthy()
    expect(localStorage.getItem('feature_menu_collapsed')).toBe('false')
  })
})

describe('Shell temporary overlay — pin button', () => {
  function renderPinnableShell(path = '/dashboard') {
    localStorage.setItem('feature_menu_collapsed', 'true')
    stubMatchMedia((query: string) => {
      if (query.includes('prefers-reduced-motion')) return false
      if (query.includes('min-width: 801px')) return true
      return false
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Shell />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  const openOverlay = (container: HTMLElement) => {
    const rail = container.querySelector<HTMLElement>('.shell-sidebar-slot > aside')!
    fireEvent.focusIn(rail.querySelector<HTMLButtonElement>('button[title="Dashboard"]')!)
    const overlay = container.querySelector<HTMLElement>('.shell-sidebar-overlay')!
    expect(overlay).toHaveClass('is-open')
    return overlay
  }

  it('shows a compact Pin sidebar control at the right of the overlay brand row', () => {
    const { container } = renderPinnableShell()
    const overlay = openOverlay(container)

    const pin = screen.getByRole('button', { name: 'Pin sidebar' }) as HTMLButtonElement
    const brand = overlay.querySelector('.sidebar-brand')!
    const children = Array.from(brand.children)

    expect(pin.tagName).toBe('BUTTON')
    expect(pin).not.toHaveAttribute('disabled')
    expect(pin).toHaveAttribute('aria-label', 'Pin sidebar')
    expect(pin).toHaveAttribute('title', 'Pin sidebar')
    expect(brand).toContainElement(pin)
    expect(children[children.length - 1]).toBe(pin)
    expect(brand.querySelector('.sidebar-theme-title')).toHaveTextContent('AndJoy GitOps')
    expect(overlay.querySelector('button.sidebar-brand-expand img')).toBeNull()
  })

  it('pins the sidebar on mouse click, persists the choice, and does not navigate', () => {
    const { container } = renderPinnableShell('/dashboard')
    openOverlay(container)

    fireEvent.click(screen.getByRole('button', { name: 'Pin sidebar' }))

    expect(container.querySelector('.shell-sidebar-overlay')).toBeNull()
    expect(container.querySelector('.shell-sidebar')).not.toHaveClass('shell-sidebar-collapsed')
    expect(screen.getByRole('button', { name: 'Unpin sidebar' })).toBeInTheDocument()
    expect(localStorage.getItem('feature_menu_collapsed')).toBe('false')
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/dashboard')
  })

  it('does not collapse on pointer leave after the sidebar has been pinned', async () => {
    const { container } = renderPinnableShell()
    openOverlay(container)
    const rail = container.querySelector<HTMLElement>('.shell-sidebar-slot > aside')!
    const content = container.querySelector<HTMLElement>('.shell-content')!

    fireEvent.click(screen.getByRole('button', { name: 'Pin sidebar' }))
    fireEvent.pointerOut(rail, { relatedTarget: content })

    await new Promise((resolve) => setTimeout(resolve, 350))

    expect(rail).not.toHaveClass('shell-sidebar-collapsed')
    expect(container.querySelector('.shell-sidebar-overlay')).toBeNull()
    expect(localStorage.getItem('feature_menu_collapsed')).toBe('false')
  })

  it('expands the sidebar when clicking the overlay AndJoy GitOps title', () => {
    const { container } = renderPinnableShell()
    const overlay = openOverlay(container)
    const brandExpand = overlay.querySelector<HTMLButtonElement>('button.sidebar-brand-expand')!

    expect(brandExpand.querySelector('img')).toBeNull()
    expect(brandExpand.querySelector('.sidebar-theme-title')).toHaveTextContent('AndJoy GitOps')

    fireEvent.click(brandExpand)

    expect(container.querySelector('.shell-sidebar-overlay')).toBeNull()
    expect(container.querySelector('.shell-sidebar')).not.toHaveClass('shell-sidebar-collapsed')
    expect(localStorage.getItem('feature_menu_collapsed')).toBe('false')
  })

  it('does not double-toggle when the pin is clicked inside the overlay', () => {
    const { container } = renderPinnableShell()
    const overlay = openOverlay(container)
    const brandExpand = overlay.querySelector<HTMLButtonElement>('button.sidebar-brand-expand')!
    const pin = screen.getByRole('button', { name: 'Pin sidebar' }) as HTMLButtonElement

    expect(brandExpand).not.toContainElement(pin)

    fireEvent.click(pin)

    expect(container.querySelector('.shell-sidebar')).not.toHaveClass('shell-sidebar-collapsed')
    expect(localStorage.getItem('feature_menu_collapsed')).toBe('false')
  })

  it('supports keyboard activation by rendering a native button for the pin', () => {
    const { container } = renderPinnableShell()
    openOverlay(container)

    const pin = screen.getByRole('button', { name: 'Pin sidebar' }) as HTMLButtonElement
    expect(pin.tagName).toBe('BUTTON')
    expect(pin).toHaveAttribute('aria-label', 'Pin sidebar')
    expect(pin).not.toHaveAttribute('disabled')
  })

  it('shows filled/pinned icon when expanded and outline/unpinned while collapsed or hover-expanded', () => {
    const { container } = renderPinnableShell('/dashboard')
    const overlay = openOverlay(container)

    // The outline (unpinned) pushpin glyph renders a longer, multi-segment
    // path; the filled pin's single solid path never contains '549.3'.
    const pushedD = (root: HTMLElement) =>
      root.querySelector<HTMLElement>('.sidebar-pin')?.querySelector('svg path')?.getAttribute('d') ?? ''

    // Collapsed rail: no pin at all. Hover-expanded overlay: outline pin, "Pin sidebar".
    expect(container.querySelector('.shell-sidebar-collapsed .sidebar-pin')).toBeNull()
    const overlayPin = screen.getByRole('button', { name: 'Pin sidebar' }) as HTMLButtonElement
    expect(overlayPin).toHaveClass('sidebar-pin--unpinned')
    expect(overlayPin).not.toHaveClass('sidebar-pin--pinned')
    expect(pushedD(overlay!)).toContain('549.3')

    // Pinned/expanded (persisted 'false'): filled pin, "Unpin sidebar".
    fireEvent.click(overlayPin)
    expect(container.querySelector('.shell-sidebar-overlay')).toBeNull()
    const expandedPin = screen.getByRole('button', { name: 'Unpin sidebar' }) as HTMLButtonElement
    expect(expandedPin).toHaveClass('sidebar-pin--pinned')
    expect(expandedPin).not.toHaveClass('sidebar-pin--unpinned')
    expect(expandedPin).toHaveAttribute('title', 'Unpin sidebar')
    expect(pushedD(container.querySelector<HTMLElement>('.shell-sidebar')!)).not.toContain('549.3')
    expect(localStorage.getItem('feature_menu_collapsed')).toBe('false')

    // Unpin: back to outline state on the collapsed rail overlay.
    fireEvent.click(expandedPin)
    expect(container.querySelector('.shell-sidebar-collapsed .sidebar-pin')).toBeNull()
    expect(localStorage.getItem('feature_menu_collapsed')).toBe('true')
    const rail = container.querySelector<HTMLElement>('.shell-sidebar-slot > aside')!
    fireEvent.focusIn(rail.querySelector<HTMLButtonElement>('button[title="Dashboard"]')!)
    const againPin = screen.getByRole('button', { name: 'Pin sidebar' }) as HTMLButtonElement
    expect(againPin).toHaveClass('sidebar-pin--unpinned')
    expect(pushedD(container.querySelector<HTMLElement>('.shell-sidebar-overlay')!)).toContain('549.3')
  })
})

describe('Shell sidebar brand banner — single-row layout', () => {
  function renderShell({ collapsed = false }: { collapsed?: boolean }) {
    if (collapsed) localStorage.setItem('feature_menu_collapsed', 'true')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Shell />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  function openOverlay(container: HTMLElement) {
    const rail = container.querySelector<HTMLElement>('.shell-sidebar-slot > aside')!
    fireEvent.focusIn(rail.querySelector<HTMLButtonElement>('button[title="Dashboard"]')!)
    const overlay = container.querySelector<HTMLElement>('.shell-sidebar-overlay')!
    expect(overlay).toHaveClass('is-open')
    return overlay
  }

  it('lays out AndJoy GitOps and the pin on one row in the overlay banner', () => {
    stubMatchMedia((query: string) => {
      if (query.includes('prefers-reduced-motion')) return false
      if (query.includes('min-width: 801px')) return true
      return false
    })
    const { container } = renderShell({ collapsed: true })
    const overlay = openOverlay(container)
    const brand = overlay.querySelector('.sidebar-brand')!
    const children = Array.from(brand.children)
    const [expand, pin] = children as [HTMLElement, HTMLElement]

    expect(children).toHaveLength(2)

    // The title is the sole content of the expand control.
    const title = expand.querySelector('.sidebar-theme-title')!
    expect(expand.querySelector('img')).toBeNull()
    expect(title).toHaveTextContent('AndJoy GitOps')

    // Pin is a sibling control after the expand control (row edge), never nested.
    expect(pin.tagName).toBe('BUTTON')
    expect(pin).toHaveAttribute('aria-label', 'Pin sidebar')
    expect(brand.lastElementChild).toBe(pin)
    expect(expand).not.toContainElement(pin)
  })

  it('lays out AndJoy GitOps and the collapse pin on one row in the expanded banner', () => {
    const { container } = renderShell({ collapsed: false })
    const brand = container.querySelector('.sidebar-brand')!
    const children = Array.from(brand.children)
    const [title, pin] = children as [HTMLElement, HTMLElement]

    expect(children).toHaveLength(2)
    expect(brand.querySelector('img')).toBeNull()
    expect(title.classList.contains('sidebar-theme-title')).toBe(true)
    expect(title).toHaveTextContent('AndJoy GitOps')
    expect(pin.tagName).toBe('BUTTON')
    expect(pin).toHaveAttribute('aria-label', 'Unpin sidebar')
    expect(brand.lastElementChild).toBe(pin)
  })

  it('expands permanently when the overlay wordmark is clicked', () => {
    stubMatchMedia((query: string) => {
      if (query.includes('prefers-reduced-motion')) return false
      if (query.includes('min-width: 801px')) return true
      return false
    })
    const { container } = renderShell({ collapsed: true })
    const overlay = openOverlay(container)
    const title = overlay.querySelector('button.sidebar-brand-expand .sidebar-theme-title')!

    fireEvent.click(title)

    expect(container.querySelector('.shell-sidebar-overlay')).toBeNull()
    expect(container.querySelector('.shell-sidebar')).not.toHaveClass('shell-sidebar-collapsed')
    expect(localStorage.getItem('feature_menu_collapsed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Unpin sidebar' })).toBeInTheDocument()
  })
})

describe('Shell temporary overlay — responsive behavior', () => {
  function renderOverlayShell({ capable = true, reducedMotion = false }: { capable?: boolean; reducedMotion?: boolean }) {
    localStorage.setItem('feature_menu_collapsed', 'true')
    stubMatchMedia((query: string) => {
      if (query.includes('prefers-reduced-motion')) return reducedMotion
      if (query.includes('min-width: 801px')) return capable
      return false
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Shell />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('does not offer the overlay on touch/non-pointer layouts and keeps tap-to-expand', () => {
    const { container } = renderOverlayShell({ capable: false })
    const rail = container.querySelector<HTMLElement>('.shell-sidebar-slot > aside')!

    expect(container.querySelector('.shell-sidebar-overlay')).toBeNull()
    fireEvent.pointerOver(rail)
    expect(container.querySelector('.shell-sidebar-overlay')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(rail).not.toHaveClass('shell-sidebar-collapsed')
    expect(container.querySelector('.shell-sidebar-overlay')).toBeNull()
    expect(localStorage.getItem('feature_menu_collapsed')).toBe('false')
  })

  it('applies the reduced-motion variant and still expands for pointer-capable layouts', () => {
    const { container } = renderOverlayShell({ capable: true, reducedMotion: true })
    const overlay = container.querySelector<HTMLElement>('.shell-sidebar-overlay')!
    expect(overlay, 'pointer-capable collapsed sidebar should render the overlay').toBeTruthy()
    expect(overlay).toHaveClass('is-reduced-motion')

    fireEvent.pointerOver(container.querySelector<HTMLElement>('.shell-sidebar-slot > aside')!)
    expect(overlay).toHaveClass('is-open')
    expect(overlay).toHaveClass('is-reduced-motion')
  })

  it('leaves the slot and main content structure untouched while the overlay opens', () => {
    const { container } = renderOverlayShell({ capable: true })
    const slot = container.querySelector<HTMLElement>('.shell-sidebar-slot')!
    const rail = container.querySelector<HTMLElement>('.shell-sidebar-slot > aside')!
    const content = container.querySelector<HTMLElement>('.shell-content')!
    const body = container.querySelector<HTMLElement>('.shell-body')!

    fireEvent.pointerOver(rail)
    const overlay = container.querySelector<HTMLElement>('.shell-sidebar-overlay')!

    expect(overlay).toHaveClass('is-open')
    expect(overlay.parentElement).toBe(slot)
    expect(slot.className).toBe('shell-sidebar-slot shell-sidebar-slot-collapsed')
    expect(rail).toHaveClass('shell-sidebar-collapsed')
    expect(content.parentElement).toBe(body)
    expect(content.classList.contains('shell-sidebar-overlay')).toBe(false)
    expect(body.children).toHaveLength(2)
  })
})

describe('Shell environment selection', () => {
  const envA: EnvironmentDTO = {
    id: 1, namespace_id: 0, name: 'Env A', base_url: 'https://gitlab-a.test',
    group_ids: [11], enabled: true, only_top_level: false, include_subgroups: true,
    token_configured: true, last_tested_at: null, last_error: null, is_default: true,
  }
  const envB: EnvironmentDTO = {
    id: 2, namespace_id: 1, name: 'Env B', base_url: 'https://gitlab-b.test',
    group_ids: [22], enabled: true, only_top_level: false, include_subgroups: true,
    token_configured: true, last_tested_at: null, last_error: null, is_default: false,
  }
  const envC: EnvironmentDTO = {
    id: 3, namespace_id: 2, name: 'Env C', base_url: 'https://gitlab-c.test',
    group_ids: [], enabled: true, only_top_level: false, include_subgroups: true,
    token_configured: true, last_tested_at: null, last_error: null, is_default: false,
  }
  // /api/groups returns federated ids: (namespace_id << 44) | local_id
  const groupA: GroupDTO = { id: 11, name: 'Group A', full_path: 'group-a' }
  const groupB: GroupDTO = { id: Number((1n << 44n) | 22n), name: 'Group B', full_path: 'group-b' }
  const nestedGroupA: GroupDTO = { id: 11, name: 'Nested Group A', full_path: 'parent/group-a' }

  function renderShell(path = '/dashboard') {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })
    const rendered = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Shell />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const envLabel = () => rendered.container.querySelector<HTMLElement>('.sidebar-section .sidebar-item-label')!
    return { queryClient, envLabel, ...rendered }
  }

  it('switches the active environment through the selector and persists the choice', async () => {
    vi.mocked(api.getEnvironments).mockResolvedValue([envA, envB])
    vi.mocked(api.getGroups).mockResolvedValue([groupA, groupB])
    localStorage.setItem('gcd_selected_env_id', '1')
    const { queryClient, envLabel } = renderShell()

    // Env A is active with its group resolved.
    expect(await screen.findByText('Group A')).toBeInTheDocument()
    expect(localStorage.getItem('gcd_selected_env_id')).toBe('1')

    // Open the environment selector and switch to Env B.
    fireEvent.click(screen.getByText('Env A'))
    fireEvent.click(await screen.findByRole('button', { name: 'Env B' }))

    expect(localStorage.getItem('gcd_selected_env_id')).toBe('2')
    await vi.waitFor(() => expect(envLabel().textContent).toBe('Env B'))
    // The group re-resolves to the target environment's federated group.
    expect(await screen.findByText('Group B')).toBeInTheDocument()
    expect(localStorage.getItem('gcd_selected_group_id')).toBe(String(groupB.id))
    // The switch invalidates the group list so pages refetch for Env B.
    await vi.waitFor(() => expect(api.getGroups).toHaveBeenCalledTimes(2))
  })

  it('seeds a default group from environment group_ids on a fresh login while groups are still loading', async () => {
    vi.mocked(api.getEnvironments).mockResolvedValue([envA, envB])
    let resolveGroups!: (groups: GroupDTO[]) => void
    vi.mocked(api.getGroups).mockImplementationOnce(
      () => new Promise<GroupDTO[]>((resolve) => { resolveGroups = resolve }),
    )
    // Fresh login: no persisted env or group.
    localStorage.removeItem('gcd_selected_env_id')
    localStorage.removeItem('gcd_selected_group_id')
    renderShell()

    // The auto-resolved default environment (Env A, is_default=true) picks its
    // configured group (federated 11) immediately, before the live group list
    // fetch resolves.
    await vi.waitFor(() => {
      expect(localStorage.getItem('gcd_selected_group_id')).toBe('11')
    }, { timeout: 1000 })
    expect(localStorage.getItem('gcd_selected_env_id')).toBe('1')
    // While the live list is pending, the page must not be stuck on the
    // group spinner (a fresh-login user sees content immediately).
    expect(document.querySelector('.ant-spin')).toBeNull()

    // The live list resolves; the seeded selection is kept and labelled.
    await act(async () => resolveGroups([groupA, groupB]))
    expect(await screen.findByText('Group A')).toBeInTheDocument()
    expect(localStorage.getItem('gcd_selected_group_id')).toBe(String(groupA.id))
  })

  it('selects an explicitly configured group even when its GitLab path is nested', async () => {
    vi.mocked(api.getEnvironments).mockResolvedValue([envA])
    vi.mocked(api.getGroups).mockResolvedValue([nestedGroupA])

    renderShell()

    expect(await screen.findByText('Nested Group A')).toBeInTheDocument()
    expect(localStorage.getItem('gcd_selected_group_id')).toBe('11')
  })

  it('clears the group selection when switching to an environment without groups', async () => {
    vi.mocked(api.getEnvironments).mockResolvedValue([envA, envB, envC])
    vi.mocked(api.getGroups).mockResolvedValue([groupA, groupB])
    localStorage.setItem('gcd_selected_env_id', '1')
    renderShell()

    await screen.findByText('Group A')
    expect(localStorage.getItem('gcd_selected_group_id')).toBe('11')

    fireEvent.click(screen.getByText('Env A'))
    fireEvent.click(await screen.findByRole('button', { name: 'Env C' }))

    // Env C owns no group: the leftover Env A selection must be dropped…
    await vi.waitFor(() => expect(localStorage.getItem('gcd_selected_group_id')).toBeNull())
    expect(localStorage.getItem('gcd_selected_env_id')).toBe('3')
    expect(await screen.findByText('Select group')).toBeInTheDocument()
    // …but each environment's own persisted selection survives.
    expect(localStorage.getItem('gcd_selected_group_id_1')).toBe('11')
    // and the content is replaced by the no-groups state.
    expect(await screen.findByText('No groups available for this environment.')).toBeInTheDocument()
  })

  it('shows the no-groups state while keeping the environment selected', async () => {
    vi.mocked(api.getEnvironments).mockResolvedValue([envA, envB, envC])
    vi.mocked(api.getGroups).mockResolvedValue([groupA, groupB])
    localStorage.setItem('gcd_selected_env_id', '3')
    renderShell()

    expect(await screen.findByText('No groups available for this environment.')).toBeInTheDocument()
    expect(await screen.findByText('Select group')).toBeInTheDocument()
    expect(localStorage.getItem('gcd_selected_group_id')).toBeNull()
    expect(screen.getByText('Env C')).toBeInTheDocument()
  })

  it('does not replace a Settings page when the selected environment has no groups', async () => {
    vi.mocked(api.getEnvironments).mockResolvedValue([envC])
    vi.mocked(api.getGroups).mockResolvedValue([])
    localStorage.setItem('gcd_selected_env_id', '3')

    renderShell('/environments')

    expect(await screen.findByText('Env C')).toBeInTheDocument()
    expect(screen.queryByText('No groups available for this environment.')).toBeNull()
  })

  it('keeps a valid group selection when a stale groups payload omits it', async () => {
    vi.mocked(api.getEnvironments).mockResolvedValue([envA, envB])
    vi.mocked(api.getGroups).mockResolvedValue([groupA, groupB])
    localStorage.setItem('gcd_selected_env_id', '1')
    const { queryClient } = renderShell()

    await screen.findByText('Group A')
    expect(localStorage.getItem('gcd_selected_group_id')).toBe('11')

    // A background refetch answers with a partial dataset that lacks Env A's groups.
    vi.mocked(api.getGroups).mockResolvedValue([groupB])
    void queryClient.invalidateQueries({ queryKey: ['groups'] })
    await vi.waitFor(() => expect(api.getGroups).toHaveBeenCalledTimes(2))
    await act(async () => {})

    // The known-groups guard must preserve the selection, the label, and persistence.
    expect(screen.queryByText('Group A')).not.toBeNull()
    expect(localStorage.getItem('gcd_selected_group_id')).toBe('11')
    expect(localStorage.getItem('gcd_selected_group_id_1')).toBe('11')
    expect(screen.queryByText('No groups available for this environment.')).toBeNull()
  })

  it('keeps the environment selected while a stale environments payload is in flight', async () => {
    vi.mocked(api.getEnvironments).mockResolvedValue([envA, envB])
    vi.mocked(api.getGroups).mockResolvedValue([groupA, groupB])
    localStorage.setItem('gcd_selected_env_id', '1')
    const { queryClient } = renderShell()

    await screen.findByText('Group A')

    // A background refetch goes in flight while a stale partial list arrives.
    let resolveEnvs!: (envs: EnvironmentDTO[]) => void
    vi.mocked(api.getEnvironments).mockImplementationOnce(
      () => new Promise<EnvironmentDTO[]>((resolve) => { resolveEnvs = resolve }),
    )
    void queryClient.invalidateQueries({ queryKey: ['environments'] })
    queryClient.setQueryData<EnvironmentDTO[]>(['environments'], [envB])

    // The stale list must not evict Env A while the fresh list is in flight.
    await screen.findByText('No environment')
    expect(localStorage.getItem('gcd_selected_env_id')).toBe('1')

    // The fresh full list arrives; Env A stays active.
    resolveEnvs([envA, envB])
    expect(await screen.findByText('Group A')).toBeInTheDocument()
    expect(localStorage.getItem('gcd_selected_env_id')).toBe('1')
  })
})
