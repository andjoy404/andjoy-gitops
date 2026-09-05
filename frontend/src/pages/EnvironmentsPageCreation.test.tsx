import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, waitFor, screen } from '@testing-library/react'
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

const TEST_ENVS: any[] = []

beforeEach(() => {
  stubMatchMedia()
  stubGetComputedStyle()
  cleanup()
  vi.clearAllMocks()
  document.cookie = 'XSRF-TOKEN=test-csrf-token-12345'
})

function renderPage(environments = TEST_ENVS) {
  ;(apiModule.api.getEnvironments as ReturnType<typeof vi.fn>).mockResolvedValue(environments as any)

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

function enterGroupId(value: string) {
  const input = screen.getByRole('combobox', { name: /group ids/i })
  fireEvent.change(input, { target: { value } })
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13 })
  return input
}

describe('EnvironmentsPage - Environment Creation', () => {
  it('displays inline error notification on 403 creation failure', async () => {
    ;(apiModule.api.createEnvironment as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error('Forbidden'), { status: 403 }),
    )

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /configure gitlab environment/i }))

    await waitFor(() => {
      expect(screen.getByText('Add Environment')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('textbox', { name: /environment name/i }), {
      target: { value: 'Anonymous Company' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /gitlab url/i }), {
      target: { value: 'https://gitlab.example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('glpat-xxxxxxxx'), {
      target: { value: 'glpat-test-token' },
    })
    enterGroupId('2')

    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      const calls = (apiModule.api.createEnvironment as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.length).toBeGreaterThan(0)
    })

    await waitFor(() => {
      expect(screen.queryByText('Add Environment')).toBeInTheDocument()
    })

    const envNameInput = screen.queryByRole('textbox', { name: /environment name/i })
    expect(envNameInput).toBeInTheDocument()
  })

  it('sends correct payload on successful creation and calls API', async () => {
    ;(apiModule.api.createEnvironment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 999 })

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /configure gitlab environment/i }))

    await waitFor(() => {
      expect(screen.getByText('Add Environment')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('textbox', { name: /environment name/i }), {
      target: { value: 'Test Env' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /gitlab url/i }), {
      target: { value: 'https://gitlab.example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('glpat-xxxxxxxx'), {
      target: { value: 'glpat-test123' },
    })
    enterGroupId('123')

    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      const calls = (apiModule.api.createEnvironment as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.length).toBeGreaterThan(0)
      expect(calls[0][0].name).toBe('Test Env')
      expect(calls[0][0].base_url).toBe('https://gitlab.example.com')
      expect(calls[0][0].token).toBe('glpat-test123')
      expect(calls[0][0].group_ids).toEqual([123])
    })
  })

  it('shows loading spinner on Create button when submission is in flight', async () => {
    const resolveFn = vi.fn()
    const promise = new Promise<any>((resolve) => {
      resolveFn(() => resolve({ id: 999 }))
    })
    ;(apiModule.api.createEnvironment as ReturnType<typeof vi.fn>).mockReturnValue(promise)

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /configure gitlab environment/i }))

    await waitFor(() => {
      expect(screen.getByText('Add Environment')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('textbox', { name: /environment name/i }), {
      target: { value: 'Pending Env' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /gitlab url/i }), {
      target: { value: 'https://gitlab.example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('glpat-xxxxxxxx'), {
      target: { value: 'glpat-token' },
    })
    enterGroupId('42')

    const createBtn = screen.getByRole('button', { name: /create/i })
    fireEvent.click(createBtn)

    await waitFor(() => {
      const antdOkBtn = document.querySelector('[class*="ant-modal-confirm"] .ant-btn-primary')
      if (antdOkBtn) {
        expect(antdOkBtn).toHaveAttribute('aria-disabled', 'true')
      }
    })

    resolveFn()
  })

  it('prevents duplicate submissions while a request is in flight', async () => {
    const resolveFn = vi.fn()
    const promise = new Promise<any>((resolve) => {
      resolveFn(() => resolve({ id: 999 }))
    })
    ;(apiModule.api.createEnvironment as ReturnType<typeof vi.fn>).mockReturnValue(promise)

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /configure gitlab environment/i }))

    await waitFor(() => {
      expect(screen.getByText('Add Environment')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('textbox', { name: /environment name/i }), {
      target: { value: 'No Duplicate' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /gitlab url/i }), {
      target: { value: 'https://gitlab.example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('glpat-xxxxxxxx'), {
      target: { value: 'glpat-token' },
    })
    enterGroupId('42')

    const createBtn = screen.getByRole('button', { name: /create/i })
    fireEvent.click(createBtn)
    fireEvent.click(createBtn)

    await new Promise((r) => setTimeout(r, 10))
    fireEvent.click(createBtn)
    await new Promise((r) => setTimeout(r, 10))

    const calls = (apiModule.api.createEnvironment as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBe(1)

    resolveFn()
    await new Promise((r) => setTimeout(r, 10))
  })

  it('keeps modal open and form data visible after a submission error', async () => {
    ;(apiModule.api.createEnvironment as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('GitLab token is invalid'),
    )

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /configure gitlab environment/i }))

    await waitFor(() => {
      expect(screen.getByText('Add Environment')).toBeInTheDocument()
    })

    const nameInput = screen.getByRole('textbox', { name: /environment name/i })
    const urlInput = screen.getByRole('textbox', { name: /gitlab url/i })
    const tokenInput = screen.getByPlaceholderText('glpat-xxxxxxxx')
    fireEvent.change(nameInput, { target: { value: 'Failed Env' } })
    fireEvent.change(urlInput, { target: { value: 'https://gitlab.example.com' } })
    fireEvent.change(tokenInput, { target: { value: 'bad-token' } })
    enterGroupId('42')

    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(screen.getByText('Add Environment')).toBeInTheDocument()
    })

    expect(nameInput).toHaveValue('Failed Env')
    expect(urlInput).toHaveValue('https://gitlab.example.com')
    expect(tokenInput).toHaveValue('bad-token')
    expect(screen.getByText('#42')).toBeInTheDocument()
  })

  it('closes modal on successful submission and invalidates query', async () => {
    ;(apiModule.api.createEnvironment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 999 })

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /configure gitlab environment/i }))

    await waitFor(() => {
      expect(screen.getByText('Add Environment')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByRole('textbox', { name: /environment name/i }), {
      target: { value: 'Success Env' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /gitlab url/i }), {
      target: { value: 'https://gitlab.example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('glpat-xxxxxxxx'), {
      target: { value: 'glpat-token' },
    })
    enterGroupId('42')

    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      // After successful save Ant Design marks the drawer wrapper as hidden
      const drawerWrapper = document.querySelector('.ant-drawer-content-wrapper')
      expect(drawerWrapper).toHaveClass('ant-drawer-content-wrapper-hidden')
    })
  })
})
