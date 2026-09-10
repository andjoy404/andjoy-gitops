import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { stubMatchMedia, stubGetComputedStyle } from '../test-utils/test-helpers'
import { api } from '../services/api'
import AuthenticationsPage from './AuthenticationsPage'
import type { GlobalConfigDTO } from '../types'

const { getGlobalConfig, updateGlobalConfig, getAuthConfig } = vi.hoisted(() => ({
  getGlobalConfig: vi.fn(),
  updateGlobalConfig: vi.fn(),
  getAuthConfig: vi.fn(),
}))

vi.mock('../services/api', () => ({
  api: {
    getGlobalConfig,
    updateGlobalConfig,
    getAuthConfig,
  },
}))

let serverConfig: GlobalConfigDTO = {
  company_name: 'Acme Corp',
  company_logo: '',
  pipeline_view: 'latest',
  sso_enabled: false,
  local_login_enabled: true,
  oidc_issuer_uri: null,
  oidc_client_id: null,
  oidc_client_secret: null,
  oidc_admin_group_claim: null,
  oidc_admin_group_value: null,
}

function setupServer(initial: GlobalConfigDTO) {
  serverConfig = { ...initial }
  getGlobalConfig.mockImplementation(() => Promise.resolve({ ...serverConfig }))
  getAuthConfig.mockImplementation(() => Promise.resolve({
    sso_enabled: serverConfig.sso_enabled ?? false,
    local_login_enabled: serverConfig.local_login_enabled ?? true,
    sso_provider_name: null,
  }))
  updateGlobalConfig.mockImplementation((payload) => {
    serverConfig = {
      ...serverConfig,
      ...payload,
    }
    return Promise.resolve(undefined)
  })
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter>
        <AuthenticationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AuthenticationsPage', () => {
  beforeEach(() => {
    stubMatchMedia()
    stubGetComputedStyle()
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('user_role', 'admin')
    cleanup()
  })

  it('renders page header with correct title and subtitle', async () => {
    setupServer({
      company_name: 'Acme Corp',
      company_logo: '',
      pipeline_view: 'latest',
      sso_enabled: false,
      local_login_enabled: true,
      oidc_issuer_uri: null,
      oidc_client_id: null,
      oidc_client_secret: null,
      oidc_admin_group_claim: null,
      oidc_admin_group_value: null,
    })
    renderPage()
    expect(await screen.findByText('Authentications')).toBeInTheDocument()
    expect(screen.getByText('Manage Single Sign-On (SSO) identity providers and login policies')).toBeInTheDocument()
  })

  it('renders SSO toggle and local login toggle', async () => {
    setupServer({
      company_name: 'Acme Corp',
      company_logo: '',
      pipeline_view: 'latest',
      sso_enabled: false,
      local_login_enabled: true,
      oidc_issuer_uri: null,
      oidc_client_id: null,
      oidc_client_secret: null,
      oidc_admin_group_claim: null,
      oidc_admin_group_value: null,
    })
    renderPage()
    await screen.findByText('Enable SSO')
    expect(screen.getByText('Enable Local Login')).toBeInTheDocument()
  })

  it('renders OIDC configuration fields with initial values', async () => {
    setupServer({
      company_name: 'Acme Corp',
      company_logo: '',
      pipeline_view: 'latest',
      sso_enabled: false,
      local_login_enabled: true,
      oidc_issuer_uri: 'https://idp.example.com',
      oidc_client_id: 'my-client-id',
      oidc_client_secret: 'secret123',
      oidc_admin_group_claim: 'groups',
      oidc_admin_group_value: 'admin',
    })
    renderPage()

    expect(await screen.findByRole('textbox', { name: /Issuer URI/i })).toHaveValue('https://idp.example.com')
    expect(screen.getByRole('textbox', { name: /Client ID/i })).toHaveValue('my-client-id')
    expect(screen.getByRole('textbox', { name: /Group Claim Name/i })).toHaveValue('groups')
    expect(screen.getByRole('textbox', { name: /Admin Group Value/i })).toHaveValue('admin')
  })

  it('toggles SSO on and reflects the state', async () => {
    setupServer({
      company_name: 'Acme Corp',
      company_logo: '',
      pipeline_view: 'latest',
      sso_enabled: false,
      local_login_enabled: true,
      oidc_issuer_uri: null,
      oidc_client_id: null,
      oidc_client_secret: null,
      oidc_admin_group_claim: null,
      oidc_admin_group_value: null,
    })
    renderPage()
    await screen.findByText('Enable SSO')
    const switches = document.querySelectorAll('.ant-switch')
    expect(switches.length).toBeGreaterThanOrEqual(2)
    // First switch should be off (SSO disabled)
    expect(switches[0]).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(switches[0])
    expect(switches[0]).toHaveAttribute('aria-checked', 'true')
  })

  it('saves authentication settings with correct payload', async () => {
    setupServer({
      company_name: 'Acme Corp',
      company_logo: '',
      pipeline_view: 'latest',
      sso_enabled: false,
      local_login_enabled: true,
      oidc_issuer_uri: 'https://accounts.google.com',
      oidc_client_id: 'google-client',
      oidc_client_secret: '',
      oidc_admin_group_claim: 'groups',
      oidc_admin_group_value: 'admin',
    })
    renderPage()
    await screen.findByText('Enable SSO')

    const saveBtn = await screen.findByRole('button', { name: /Save settings/i })
    fireEvent.click(saveBtn)

    expect(await screen.findByText(/Authentication settings saved/i)).toBeTruthy()
    expect(updateGlobalConfig).toHaveBeenCalledTimes(1)
    expect(updateGlobalConfig).toHaveBeenCalledWith({
      company_name: 'Acme Corp',
      pipeline_view: 'latest',
      sso_enabled: false,
      local_login_enabled: true,
      oidc_issuer_uri: 'https://accounts.google.com',
      oidc_client_id: 'google-client',
      oidc_client_secret: null,
      oidc_admin_group_claim: 'groups',
      oidc_admin_group_value: 'admin',
    }, expect.anything())
  })

  it('saves with SSO enabled and local login disabled', async () => {
    setupServer({
      company_name: 'Acme Corp',
      company_logo: '',
      pipeline_view: 'latest',
      sso_enabled: true,
      local_login_enabled: false,
      oidc_issuer_uri: 'https://login.microsoftonline.com/tenant-id',
      oidc_client_id: 'ms-client',
      oidc_client_secret: 'secret',
      oidc_admin_group_claim: 'groups',
      oidc_admin_group_value: 'Corporate Admins',
    })
    renderPage()
    await screen.findByText('Enable SSO')

    const switches = document.querySelectorAll('.ant-switch')
    expect(switches[0]).toHaveAttribute('aria-checked', 'true')
    expect(switches[1]).toHaveAttribute('aria-checked', 'false')

    const saveBtn = await screen.findByRole('button', { name: /Save settings/i })
    fireEvent.click(saveBtn)

    expect(await screen.findByText(/Authentication settings saved/i)).toBeTruthy()
    expect(updateGlobalConfig).toHaveBeenCalledWith({
      company_name: 'Acme Corp',
      pipeline_view: 'latest',
      sso_enabled: true,
      local_login_enabled: false,
      oidc_issuer_uri: 'https://login.microsoftonline.com/tenant-id',
      oidc_client_id: 'ms-client',
      oidc_client_secret: 'secret',
      oidc_admin_group_claim: 'groups',
      oidc_admin_group_value: 'Corporate Admins',
    }, expect.anything())
  })

  it('shows save error when API rejects', async () => {
    setupServer({
      company_name: 'Acme Corp',
      company_logo: '',
      pipeline_view: 'latest',
      sso_enabled: false,
      local_login_enabled: true,
      oidc_issuer_uri: null,
      oidc_client_id: null,
      oidc_client_secret: null,
      oidc_admin_group_claim: null,
      oidc_admin_group_value: null,
    })
    updateGlobalConfig.mockRejectedValue(new Error('Network error'))
    renderPage()

    await screen.findByText('Enable SSO')
    const saveBtn = await screen.findByRole('button', { name: /Save settings/i })
    fireEvent.click(saveBtn)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Network error')
  })
})
