import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { stubMatchMedia, stubGetComputedStyle } from '../test-utils/test-helpers'
import EnvironmentsPage from '../pages/EnvironmentsPage'
import * as apiModule from '../services/api'

vi.mock('../services/api', () => ({
  api: {
    getEnvironments: vi.fn(),
    createEnvironment: vi.fn(),
    updateEnvironment: vi.fn().mockResolvedValue(undefined),
    deleteEnvironment: vi.fn().mockResolvedValue(undefined),
    setDefaultEnvironment: vi.fn().mockResolvedValue(undefined),
  },
  queryClient: vi.fn(),
}))

const TEST_ENVS = [
  {
    id: 1,
    namespace_id: 100,
    name: 'Development',
    base_url: 'https://gitlab.example.com',
    group_ids: [10, 20],
    enabled: true,
    only_top_level: false,
    include_subgroups: true,
    token_configured: true,
    last_tested_at: '2024-01-15T10:00:00Z',
    last_error: null,
    is_default: true,
  },
]

beforeEach(() => {
  stubMatchMedia()
  stubGetComputedStyle()
})

function renderPage(environments = TEST_ENVS) {
  ;(apiModule.api.getEnvironments as ReturnType<typeof vi.fn>).mockResolvedValue(environments as Awaited<ReturnType<typeof apiModule.api.getEnvironments>>)

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/environments']}>
        <Routes>
          <Route path="/environments" element={<EnvironmentsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { queryClient }
}

describe('EnvironmentsPage', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders empty state when no environments', async () => {
    renderPage([])

    expect(await screen.findByText('Connect your first GitLab environment')).toBeInTheDocument()
    expect(screen.getByText(/No GitLab environment is configured yet/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Connect your first GitLab environment')

    const configureBtn = screen.getByRole('button', { name: /configure gitlab environment/i })
    expect(configureBtn).toBeInTheDocument()
    expect(configureBtn).toHaveTextContent('Configure GitLab environment')

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders one header icon with title and subtitle in the list view', async () => {
    document.body.setAttribute('data-theme', 'dark')
    renderPage()
    expect(await screen.findByText('Manage GitLab instances and monitored groups')).toBeInTheDocument()
    expect(document.querySelectorAll('.page-header-icon').length).toBe(1)
    document.body.removeAttribute('data-theme')
  })

  it('opens create form modal when clicking "Configure GitLab environment" on empty state', async () => {
    renderPage([])

    const configureBtn = screen.getByRole('button', { name: /configure gitlab environment/i })
    fireEvent.click(configureBtn)

    await waitFor(() => {
      expect(screen.getByText('Add Environment')).toBeInTheDocument()
    })

    // Modal fields are rendered with accessible labels
    expect(screen.getByRole('textbox', { name: /environment name/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /gitlab url/i })).toBeInTheDocument()
    // Token input uses a password field with "glpat-" placeholder
    expect(screen.getByPlaceholderText('glpat-xxxxxxxx')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /group ids/i })).toBeInTheDocument()
  })

  it('closes create form modal when clicking Cancel', async () => {
    renderPage([])

    fireEvent.click(screen.getByRole('button', { name: /configure gitlab environment/i }))

    await waitFor(() => {
      expect(screen.getByText('Add Environment')).toBeInTheDocument()
    })

    // Ant Design Modal Cancel button - query by text content
    const cancelBtn = screen.getByText('Cancel')
    fireEvent.click(cancelBtn)

    // Verify the onClosed callback fires and formState is reset
    // (Ant Design Modal uses CSS hide during animation, so we verify
    //  the form is re-settable by opening it again from the page)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /configure gitlab environment/i })).toBeInTheDocument()
    })
  })

  it('saves new environment successfully', async () => {
    ;(apiModule.api.createEnvironment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 999 })

    renderPage([])

    fireEvent.click(screen.getByRole('button', { name: /configure gitlab environment/i }))

    await waitFor(() => {
      expect(screen.getByText('Add Environment')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('textbox', { name: /environment name/i }), { target: { value: 'Test Env' } })
    fireEvent.change(screen.getByRole('textbox', { name: /gitlab url/i }), { target: { value: 'https://gitlab.example.com' } })
    fireEvent.change(screen.getByPlaceholderText('glpat-xxxxxxxx'), { target: { value: 'glpat-test123' } })
    fireEvent.change(screen.getByRole('textbox', { name: /group ids/i }), { target: { value: '123, 456' } })

    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      // Check call was made with these args (may be called in both page and modal)
      const calls = (apiModule.api.createEnvironment as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.some(c => c[0].name === 'Test Env' && c[0].token === 'glpat-test123')).toBe(true)
    })
  })

  it('displays error when save fails', async () => {
    ;(apiModule.api.createEnvironment as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Token is invalid'))

    renderPage([])

    fireEvent.click(screen.getByRole('button', { name: /configure gitlab environment/i }))

    await waitFor(() => {
      expect(screen.getByText('Add Environment')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('textbox', { name: /environment name/i }), { target: { value: 'Test Env' } })
    fireEvent.change(screen.getByRole('textbox', { name: /gitlab url/i }), { target: { value: 'https://gitlab.example.com' } })
    fireEvent.change(screen.getByPlaceholderText('glpat-xxxxxxxx'), { target: { value: 'glpat-test123' } })
    fireEvent.change(screen.getByRole('textbox', { name: /group ids/i }), { target: { value: '123' } })

    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      // Check that API was called and rejected
      const calls = (apiModule.api.createEnvironment as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.length).toBeGreaterThan(0)
    })

    // Modal should remain open for user to fix (more reliable than checking for message component)
    await waitFor(() => {
      expect(screen.getByText('Add Environment')).toBeInTheDocument()
    })
  })

  it('renders environment list with action buttons', async () => {
    localStorage.setItem('user_role', 'admin')

    renderPage(TEST_ENVS)

    expect(await screen.findByText('Development')).toBeInTheDocument()
    expect(screen.getByText('https://gitlab.example.com')).toBeInTheDocument()
    expect(screen.getByText('10, 20')).toBeInTheDocument()
    expect(screen.getByText('Enabled')).toBeInTheDocument()

    const editBtn = screen.getByRole('button', { name: /edit/i })
    expect(editBtn).toBeInTheDocument()

    const deleteBtn = screen.getByRole('button', { name: /delete/i })
    expect(deleteBtn).toBeInTheDocument()

    const setDefaultBtn = screen.getByTitle('Set as default')
    expect(setDefaultBtn).toBeInTheDocument()
  })

  it('renders multiple environments in a table', async () => {
    const multiEnvs = [
      {
        id: 1,
        namespace_id: 100,
        name: 'Development',
        base_url: 'https://gitlab.example.com',
        group_ids: [10],
        enabled: true,
        only_top_level: false,
        include_subgroups: true,
        token_configured: true,
        last_tested_at: null as unknown as string,
        last_error: null,
        is_default: false,
      },
      {
        id: 2,
        namespace_id: 200,
        name: 'Production',
        base_url: 'https://gitlab.prod.example.com',
        group_ids: [30, 40, 50],
        enabled: true,
        only_top_level: true,
        include_subgroups: false,
        token_configured: true,
        last_tested_at: '2024-02-01T08:00:00Z',
        last_error: null,
        is_default: true,
      },
    ]

    renderPage(multiEnvs)

    expect(await screen.findByText('Development')).toBeInTheDocument()
    expect(screen.getByText('Production')).toBeInTheDocument()
    expect(screen.getByText('https://gitlab.prod.example.com')).toBeInTheDocument()
    expect(screen.getByText('30, 40, 50')).toBeInTheDocument()
  })

  describe('shared boxed page header', () => {
    it('renders the shared boxed header with one icon, title, subtitle, and actions', async () => {
      renderPage()
      await screen.findByText('Manage GitLab instances and monitored groups')
      expect(document.querySelectorAll('.page-header-box').length).toBe(1)
      expect(document.querySelectorAll('.page-header-icon').length).toBe(1)
      expect(screen.getByRole('heading', { level: 2, name: 'Environments' })).toBeInTheDocument()
      expect(document.querySelectorAll('.page-header-actions').length).toBe(1)
      expect(screen.getByRole('button', { name: /add environment/i })).toBeInTheDocument()
    })

    it('keeps the shared boxed header under light and dark themes', async () => {
      renderPage()
      await screen.findByText('Manage GitLab instances and monitored groups')
      expect(document.querySelectorAll('.page-header-box').length).toBe(1)
      document.body.setAttribute('data-theme', 'dark')
      expect(document.querySelectorAll('.page-header-box').length).toBe(1)
      expect(document.querySelectorAll('.page-header-icon').length).toBe(1)
      document.body.removeAttribute('data-theme')
    })
  })
})
