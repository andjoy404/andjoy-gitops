import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { CloudServerOutlined } from '@ant-design/icons'
import { stubMatchMedia, stubGetComputedStyle } from '../test-utils/test-helpers'
import { api } from '../services/api'
import GlobalConfigPage from './GlobalConfigPage'
import type { GlobalConfigDTO } from '../types'

const { getGlobalConfig, updateGlobalConfig } = vi.hoisted(() => ({
  getGlobalConfig: vi.fn(),
  updateGlobalConfig: vi.fn(),
}))

vi.mock('../services/api', () => ({
  api: {
    getGlobalConfig,
    updateGlobalConfig,
  },
}))

// Mirrors how Shell.tsx renders the header/sidebar logo from the same
// ['global-config'] query, so cache updates from the page can be observed.
function LogoChrome() {
  const { data } = useQuery<GlobalConfigDTO>({
    queryKey: ['global-config'],
    queryFn: api.getGlobalConfig,
  })
  return data?.company_logo ? (
    <img src={data.company_logo} alt="Logo" />
  ) : (
    <CloudServerOutlined data-testid="logo-fallback" />
  )
}

// Simulates the backend upsert of the singleton settings row.
let serverConfig: GlobalConfigDTO = {
  company_name: 'Acme Corp',
  company_logo: '',
  pipeline_view: 'latest',
}

function setupServer(initial: GlobalConfigDTO) {
  serverConfig = { ...initial }
  getGlobalConfig.mockImplementation(() => Promise.resolve({ ...serverConfig }))
  updateGlobalConfig.mockImplementation(
    (payload: { company_name: string; company_logo?: string; pipeline_view: string }) => {
      serverConfig = {
        ...serverConfig,
        ...payload,
        company_logo: payload.company_logo ?? '',
      }
      return Promise.resolve(undefined)
    },
  )
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPage(withChrome = false) {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter>
        {withChrome ? <LogoChrome /> : null}
        <GlobalConfigPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function waitUntilFormSynced() {
  await waitFor(() => {
    expect(screen.getByRole('textbox', { name: /company name/i })).toHaveValue(
      serverConfig.company_name,
    )
  })
}

describe('GlobalConfigPage', () => {
  beforeEach(() => {
    stubMatchMedia()
    stubGetComputedStyle()
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('user_role', 'admin')
    document.documentElement.classList.remove('dark-theme')
    cleanup()
  })

  it('renders one header icon with title and subtitle under dark theme', async () => {
    document.body.setAttribute('data-theme', 'dark')
    setupServer({ company_name: 'Acme Corp', company_logo: '', pipeline_view: 'latest' })
    renderPage()
    expect(await screen.findByText('Application settings')).toBeInTheDocument()
    expect(document.querySelectorAll('.page-header-icon').length).toBe(1)
    expect(screen.getByText('Manage shared dashboard settings used across all connected GitLab environments')).toBeInTheDocument()
    document.body.removeAttribute('data-theme')
  })

  it('shows a mild success notification after a successful save', async () => {
    setupServer({
      company_name: 'Acme Corp',
      company_logo: 'https://acme.com/logo.png',
      pipeline_view: 'latest',
    })
    renderPage()

    const save = await screen.findByRole('button', { name: 'Save settings' })
    await waitUntilFormSynced()
    fireEvent.click(save)

    expect(await screen.findByRole('status')).toHaveTextContent('Settings saved')
    expect(updateGlobalConfig).toHaveBeenCalledTimes(1)
    // second arg is react-query context
    expect(updateGlobalConfig).toHaveBeenCalledWith(
      {
        company_name: 'Acme Corp',
        company_logo: 'https://acme.com/logo.png',
        pipeline_view: 'latest',
      },
      expect.anything(),
    )
  })

  it('shows save errors inside the form without replacing the page content', async () => {
    setupServer({ company_name: 'Acme Corp', company_logo: '', pipeline_view: 'latest' })
    updateGlobalConfig.mockRejectedValue(new Error('Connection refused'))
    renderPage()

    await screen.findByRole('button', { name: 'Save settings' })
    await waitUntilFormSynced()
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Connection refused')
    // Page content (heading + form + save button) stays intact
    expect(screen.getByText('Application settings')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeInTheDocument()
  })

  it('shows the logo removal button only when a logo exists', async () => {
    setupServer({
      company_name: 'Acme Corp',
      company_logo: 'https://acme.com/logo.png',
      pipeline_view: 'latest',
    })
    renderPage()
    expect(await screen.findByRole('button', { name: 'Remove company logo' })).toBeInTheDocument()

    cleanup()
    setupServer({ company_name: 'Acme Corp', company_logo: '', pipeline_view: 'latest' })
    renderPage()
    await screen.findByText('No logo set')
    expect(screen.queryByRole('button', { name: 'Remove company logo' })).not.toBeInTheDocument()
  })

  it('removing the logo only changes local state before Save', async () => {
    setupServer({
      company_name: 'Acme Corp',
      company_logo: 'https://acme.com/logo.png',
      pipeline_view: 'latest',
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Remove company logo' }))

    expect(screen.queryByAltText('Company logo preview')).not.toBeInTheDocument()
    expect(screen.getByText('No logo set')).toBeInTheDocument()
    // Nothing persisted yet
    expect(updateGlobalConfig).not.toHaveBeenCalled()
    // The remove button disappears once the logo is gone
    expect(screen.queryByRole('button', { name: 'Remove company logo' })).not.toBeInTheDocument()
  })

  it('persists the logo removal on Save with an empty logo value', async () => {
    setupServer({
      company_name: 'Acme Corp',
      company_logo: 'https://acme.com/logo.png',
      pipeline_view: 'latest',
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Remove company logo' }))
    await waitUntilFormSynced()
    fireEvent.click(await screen.findByRole('button', { name: 'Save settings' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Settings saved')
    // second arg is react-query context
    expect(updateGlobalConfig).toHaveBeenCalledWith(
      {
        company_name: 'Acme Corp',
        company_logo: '',
        pipeline_view: 'latest',
      },
      expect.anything(),
    )
  })

  it('refreshes the global header/sidebar logo after saving a removed logo', async () => {
    setupServer({
      company_name: 'Acme Corp',
      company_logo: 'https://acme.com/logo.png',
      pipeline_view: 'latest',
    })
    renderPage(true)

    const headerLogo = await screen.findByAltText('Logo')
    expect(headerLogo).toHaveAttribute('src', 'https://acme.com/logo.png')
    await waitUntilFormSynced()

    fireEvent.click(await screen.findByRole('button', { name: 'Remove company logo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save settings' }))
    await screen.findByRole('status')

    // Header/sidebar chrome re-renders from the updated query cache
    await waitFor(() => {
      expect(screen.queryByAltText('Logo')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('logo-fallback')).toBeInTheDocument()
  })

  describe('shared boxed page header', () => {
    it('renders the shared boxed header with one icon, title, and subtitle', async () => {
      setupServer({ company_name: 'Acme Corp', company_logo: '', pipeline_view: 'latest' })
      renderPage()
      await screen.findByText('Application settings')
      expect(document.querySelectorAll('.page-header-box').length).toBe(1)
      expect(document.querySelectorAll('.page-header-icon').length).toBe(1)
      expect(screen.getByRole('heading', { level: 2, name: 'Application settings' })).toBeInTheDocument()
      expect(screen.getByText('Manage shared dashboard settings used across all connected GitLab environments')).toBeInTheDocument()
    })

    it('keeps the save action and boxed header under light and dark themes', async () => {
      setupServer({ company_name: 'Acme Corp', company_logo: '', pipeline_view: 'latest' })
      renderPage()
      await screen.findByText('Application settings')
      expect(document.querySelectorAll('.page-header-box').length).toBe(1)
      expect(await screen.findByRole('button', { name: 'Save settings' })).toBeInTheDocument()
      document.body.setAttribute('data-theme', 'dark')
      expect(document.querySelectorAll('.page-header-box').length).toBe(1)
      expect(document.querySelectorAll('.page-header-icon').length).toBe(1)
      document.body.removeAttribute('data-theme')
    })
  })

  describe('theme selection', () => {
    it('renders light and dark options, with a stored dark preference shown as Dark', async () => {
      setupServer({ company_name: 'Acme Corp', company_logo: '', pipeline_view: 'latest' })
      localStorage.setItem('theme', 'dark')
      document.documentElement.classList.add('dark-theme')
      renderPage()
      await screen.findByText('Application settings')
      const lightBtn = screen.getByRole('button', { name: 'Light theme' })
      const darkBtn = screen.getByRole('button', { name: 'Dark theme' })
      expect(lightBtn).toHaveAttribute('aria-pressed', 'false')
      expect(darkBtn).toHaveAttribute('aria-pressed', 'true')
      expect(darkBtn).toHaveTextContent('Dark')
      expect(lightBtn).toHaveTextContent('Light')
    })

    it('applies dark as a live preview without persisting it yet', async () => {
      setupServer({ company_name: 'Acme Corp', company_logo: '', pipeline_view: 'latest' })
      renderPage()
      await screen.findByText('Application settings')
      fireEvent.click(screen.getByRole('button', { name: 'Dark theme' }))
      expect(document.documentElement.classList.contains('dark-theme')).toBe(true)
      // Preview only: not written to storage until Save is clicked.
      expect(localStorage.getItem('theme')).toBeNull()
      expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'true')
      expect(updateGlobalConfig).not.toHaveBeenCalled()
    })

    it('selecting light previews the change without persisting it yet', async () => {
      setupServer({ company_name: 'Acme Corp', company_logo: '', pipeline_view: 'latest' })
      localStorage.setItem('theme', 'dark')
      document.documentElement.classList.add('dark-theme')
      renderPage()
      await screen.findByText('Application settings')
      fireEvent.click(screen.getByRole('button', { name: 'Light theme' }))
      expect(document.documentElement.classList.contains('dark-theme')).toBe(false)
      // Preview only: the previously stored theme is left untouched.
      expect(localStorage.getItem('theme')).toBe('dark')
      expect(screen.getByRole('button', { name: 'Light theme' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('keeps the theme out of the backend save payload', async () => {
      setupServer({ company_name: 'Acme Corp', company_logo: '', pipeline_view: 'latest' })
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'Dark theme' }))
      await waitUntilFormSynced()
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
      expect(await screen.findByRole('status')).toHaveTextContent('Settings saved')
      expect(updateGlobalConfig).toHaveBeenCalledWith(
        {
          company_name: 'Acme Corp',
          company_logo: '',
          pipeline_view: 'latest',
        },
        expect.anything(),
      )
      expect(localStorage.getItem('theme')).toBe('dark')
    })
  })
})
