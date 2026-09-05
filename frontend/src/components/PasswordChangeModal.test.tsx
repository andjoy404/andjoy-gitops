import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { screen, fireEvent, waitFor } from '@testing-library/dom'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { stubMatchMedia, stubGetComputedStyle } from '../test-utils/test-helpers'
import PasswordChangeModal from './PasswordChangeModal'
import * as apiModule from '../services/api'

vi.mock('../services/api', () => ({
  api: {
    changePassword: vi.fn(),
  },
  queryClient: {
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  },
}))

const mockNavigate = vi.fn()
const mockClose = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

beforeEach(() => {
  stubMatchMedia()
  stubGetComputedStyle()
  vi.clearAllMocks()
  mockNavigate.mockClear()
  mockClose.mockClear()
})

function renderModal(open = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PasswordChangeModal open={open} onClose={mockClose} />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { queryClient }
}

describe('PasswordChangeModal', () => {
  beforeEach(() => {
    cleanup()
  })

  it('modal is visible when open=true (must_change_password=true)', () => {
    renderModal(true)

    expect(screen.getByText('Change Password Required')).toBeInTheDocument()
    expect(
      screen.getByText(/Your password must be changed before you can continue/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('New Password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument()
  })

  it('follows the active dashboard theme: scoped styles, Dark-mode autofill, no hardcoded light colors', () => {
    renderModal(true)

    // Portal root carries the scope class used by password-change.css
    expect(document.querySelector('.password-change-modal')).toBeInTheDocument()

    const intro = screen
      .getByText(/Your password must be changed before you can continue/)
      .closest('p')!
    expect(intro).toHaveClass('password-change-intro')
    expect(intro).not.toHaveAttribute('style')

    const css = readFileSync(
      resolve(fileURLToPath(import.meta.url), '..', '..', 'styles', 'password-change.css'),
      'utf8',
    )
    const cssRule = (selector: string): string => {
      const at = css.indexOf(selector)
      expect(at, `rule for "${selector}"`).toBeGreaterThanOrEqual(0)
      const open = css.indexOf('{', at)
      let depth = 0
      for (let i = open; i < css.length; i += 1) {
        if (css[i] === '{') depth += 1
        if (css[i] === '}') depth -= 1
        if (depth === 0) return css.slice(open + 1, i)
      }
      throw new Error(`unbalanced rule for "${selector}"`)
    }

    // Modal surface, title, labels, and text follow the active theme tokens
    const surfaceRule = cssRule('.password-change-modal .ant-modal-content {')
    expect(surfaceRule).toContain('color: var(--dashboard-text) !important')
    expect(surfaceRule).toContain('background: var(--dashboard-surface) !important')
    expect(surfaceRule).toContain('border: 1px solid var(--dashboard-border) !important')
    expect(cssRule('.password-change-modal .ant-modal-title {')).toContain('color: var(--dashboard-text) !important')
    expect(cssRule('.password-change-intro {')).toContain('color: var(--dashboard-muted)')
    expect(cssRule('.password-change-modal .ant-form-item-label label {')).toContain('color: var(--dashboard-text) !important')

    // Inputs: themed border/background, violet hover/focus, semantic red error state
    expect(cssRule('.password-change-modal .ant-input-affix-wrapper {'))
      .toContain('background: var(--dashboard-surface-subtle) !important')
    expect(cssRule('.password-change-modal .ant-input::placeholder {')).toContain('color: var(--dashboard-muted) !important')
    expect(cssRule('.password-change-modal .ant-input-suffix .ant-input-password-icon {'))
      .toContain('color: var(--dashboard-muted) !important')
    expect(cssRule('.password-change-modal .ant-input-affix-wrapper:hover {'))
      .toContain('var(--dashboard-accent)')
    expect(cssRule('.password-change-modal .ant-input-affix-wrapper-focused {'))
      .toContain('border-color: var(--dashboard-accent) !important')
    expect(cssRule('.password-change-modal .ant-input-affix-wrapper-status-error,')).toContain('border-color: var(--dashboard-danger) !important')
    expect(cssRule('.password-change-modal .ant-form-item-explain-error {')).toContain('color: var(--dashboard-danger) !important')

    // Submission error alert stays semantic red from theme tokens
    const errorRule = cssRule('.password-change-error {')
    expect(errorRule).toContain('color: var(--dashboard-danger)')
    expect(errorRule).toContain('var(--dashboard-danger)')

    // Dark theme: dark color-scheme and dark autofill (no white flash)
    expect(cssRule('html.dark-theme .password-change-modal .ant-modal-content {')).toContain('color-scheme: dark')
    const autofillRule = cssRule('html.dark-theme .password-change-modal .ant-input:-webkit-autofill,')
    expect(autofillRule).toContain('-webkit-box-shadow: 0 0 0 1000px var(--dashboard-surface-subtle) inset !important')
    expect(autofillRule).toContain('-webkit-text-fill-color: var(--dashboard-text) !important')

    // No hardcoded light/white/black surfaces anywhere in the stylesheet
    expect(css).not.toMatch(/background:\s*(#fff|#ffffff|white)\b/i)
    expect(css).not.toMatch(/background:\s*(#000|#000000|black)\b/i)
  })

  it('main navigation content is blocked (modal overlays app content)', () => {
    renderModal(true)

    expect(screen.queryByText('AndJoy GitOps')).not.toBeInTheDocument()
    expect(screen.queryByText('Environments')).not.toBeInTheDocument()
    expect(screen.queryByText('Global Config')).not.toBeInTheDocument()
  })

  it('modal is hidden when open=false', () => {
    renderModal(false)

    expect(screen.queryByText('Change Password Required')).not.toBeInTheDocument()
  })

  it('closes and navigates after successful password change', async () => {
    vi.mocked(apiModule.api.changePassword).mockResolvedValue(undefined)

    renderModal(true)

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'securepassword123' },
    })
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'securepassword123' },
    })

    fireEvent.click(screen.getByText('Change Password'))

    await waitFor(() => {
      expect(apiModule.api.changePassword).toHaveBeenCalledWith({
        newPassword: 'securepassword123',
      })
      expect(mockClose).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    }, { timeout: 5000 })
  })

  it('shows error when password change fails', async () => {
    vi.mocked(apiModule.api.changePassword).mockRejectedValueOnce(
      new Error('Token expired'),
    )

    renderModal(true)

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'anotherpassword1' },
    })
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'anotherpassword1' },
    })

    fireEvent.click(screen.getByText('Change Password'))

    await waitFor(() => {
      expect(screen.getByText('Token expired')).toBeInTheDocument()
      expect(mockClose).not.toHaveBeenCalled()
    }, { timeout: 5000 })

    const errorAlert = screen.getByText('Token expired').closest('.password-change-error')!
    expect(errorAlert).toHaveAttribute('role', 'alert')
    expect(errorAlert).not.toHaveAttribute('style')
  })

  it('does not submit when passwords do not match', async () => {
    renderModal(true)

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'password1111' },
    })
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'password2222' },
    })

    fireEvent.click(screen.getByText('Change Password'))

    expect(apiModule.api.changePassword).not.toHaveBeenCalled()
    expect(mockClose).not.toHaveBeenCalled()
  })

  it('does not submit when password is too short', async () => {
    renderModal(true)

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'short' },
    })
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'short' },
    })

    fireEvent.click(screen.getByText('Change Password'))

    expect(apiModule.api.changePassword).not.toHaveBeenCalled()
    expect(mockClose).not.toHaveBeenCalled()
  })
})
