import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Login from './Login'

const mockFetch = vi.fn<any>()
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  writable: true,
  value: mockFetch,
})

function renderLogin(onSuccessfulLogin = vi.fn()) {
  return render(
    <MemoryRouter>
      <Login onSuccessfulLogin={onSuccessfulLogin} />
    </MemoryRouter>,
  )
}

function fillCredentials(username = 'admin', password = 'secret') {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
}

beforeEach(() => {
  cleanup()
  mockFetch.mockReset()
  // Default response for the auth config endpoint used by Login
  mockFetch.mockImplementation((url: string) => {
    const urlStr = String(url)
    if (urlStr.includes('/api/auth/config')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ sso_enabled: false, local_login_enabled: true, sso_provider_name: null }),
      } as Response)
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
  })
})

describe('Login page', () => {
  it('renders without crashing', () => {
    const { container } = render(<MemoryRouter><Login onSuccessfulLogin={vi.fn()} /></MemoryRouter>)
    expect(container.querySelector('.login-page')).toBeInTheDocument()
  })

  describe('dark login design', () => {
    it('mounts a single animated logo above the card and no theme toggle', () => {
      const { container } = renderLogin()
      const stand = container.querySelector('.login-stand')
      expect(stand).toBeInTheDocument()
      expect(stand?.firstElementChild).toBe(stand?.querySelector('.login-brand-lockup'))
      expect(stand?.querySelector('.login-brand-lockup')?.firstElementChild).toBe(stand?.querySelector('.login-logo'))

      const imgs = container.querySelectorAll('.login-logo img')
      expect(imgs.length).toBe(1)
      expect(imgs[0]).toHaveClass('login-logo-animated')
      expect(imgs[0].getAttribute('src')).toContain('andjoy-gitops-logo-animated')
      expect(imgs[0].getAttribute('src')).toMatch(/\.gif$/)

      expect(container.querySelector('button[aria-label="Toggle theme"]')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
      const productName = screen.getByText('AndJoy GitOps', { selector: '.login-product-name' })
      expect(productName).toBeInTheDocument()
      expect(productName.closest('.login-card')).toBeNull()
    })

    it('renders the compact headline as two centered lines inside the card', () => {
      const { container } = renderLogin()
      const head = container.querySelector('.login-card-head')
      expect(head).toBeInTheDocument()

      const title = head?.querySelector('h3')
      const subtitle = head?.querySelector('span.ant-typography')
      expect(screen.getByRole('heading', { name: 'Welcome back' })).toBe(title)
      expect(subtitle).toBeInTheDocument()
      expect(subtitle).toHaveTextContent('Sign in to continue')
      expect(title?.nextElementSibling).toBe(subtitle)
      expect(head?.querySelector('.login-product-name')).toBeNull()
    })

    it('mounts a single static logo when the user prefers reduced motion', () => {
      const originalMatchMedia = window.matchMedia
      window.matchMedia = ((query: string) => ({
        matches: true,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      })) as unknown as typeof window.matchMedia
      try {
        const { container } = renderLogin()
        const imgs = container.querySelectorAll('.login-logo img')
        expect(imgs.length).toBe(1)
        expect(imgs[0]).toHaveClass('login-logo-static')
        expect(imgs[0].getAttribute('src')).toContain('andjoy-gitops-logo')
        expect(imgs[0].getAttribute('src')).toMatch(/\.png$/)
      } finally {
        window.matchMedia = originalMatchMedia
      }
    })

    it('keeps keyboard focus on the username field on load', () => {
      const { container } = renderLogin()
      expect(container.querySelector('input#username')).toHaveFocus()
    })

    it('toggles password visibility', () => {
      renderLogin()
      const passwordInput = screen.getByLabelText('Password')
      expect(passwordInput).toHaveAttribute('type', 'password')
      const toggleOnce = () =>
        fireEvent.click(document.querySelector('.ant-input-password-icon') as Element)
      toggleOnce()
      expect(passwordInput).toHaveAttribute('type', 'text')
      toggleOnce()
      expect(passwordInput).toHaveAttribute('type', 'password')
    })

    it('shows a failure notification for rejected credentials', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          text: async () => JSON.stringify({ message: 'Invalid username or password' }),
        } as Response),
      )
      renderLogin()
      fillCredentials()
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password')
    })

    it('calls onSuccessfulLogin and keeps CSRF handling on success', async () => {
      const calls: string[] = []
      mockFetch.mockImplementation((url: string) => {
        const urlStr = String(url)
        calls.push(urlStr)
        if (urlStr.includes('/api/auth/login')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ authenticated: true, must_change_password: false }),
          } as Response)
        }
        return Promise.resolve({ ok: true, json: async () => ({ token: 'csrf' }) } as Response)
      })
      const onSuccessfulLogin = vi.fn()
      renderLogin(onSuccessfulLogin)
      fillCredentials()
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
      await waitFor(() => expect(onSuccessfulLogin).toHaveBeenCalledWith({ authenticated: true, must_change_password: false }))
      expect(calls.some((u) => u.includes('/api/auth/login'))).toBe(true)
      expect(calls.some((u) => u.includes('/api/csrf'))).toBe(true)
    })

    it('shows a network error when the request fails', async () => {
      mockFetch.mockImplementation(() => Promise.reject(new Error('offline')))
      renderLogin()
      fillCredentials()
      fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Network error')
    })
  })

  describe('SSO login flow', () => {
    it('renders "Sign in with SSO" button when sso_enabled is true', async () => {
      mockFetch.mockImplementation((url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/auth/config')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ sso_enabled: true, local_login_enabled: true, sso_provider_name: 'Okta' }),
          } as Response)
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      })
      renderLogin()
      await screen.findByText('Sign in with Okta')
      const ssoBtn = screen.getByRole('link', { name: /sign in with okta/i })
      expect(ssoBtn).toBeInTheDocument()
      expect(ssoBtn.getAttribute('href')).toBe('/oauth2/authorization/oidc')
    })

    it('renders SSO button with default provider name when sso_provider_name is null', async () => {
      mockFetch.mockImplementation((url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/auth/config')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ sso_enabled: true, local_login_enabled: true, sso_provider_name: null }),
          } as Response)
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      })
      renderLogin()
      await screen.findByText('Sign in with SSO')
    })

    it('hides username and password inputs when sso_enabled is true and local_login_enabled is false', async () => {
      mockFetch.mockImplementation((url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/auth/config')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ sso_enabled: true, local_login_enabled: false, sso_provider_name: 'Auth0' }),
          } as Response)
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      })
      const { container } = renderLogin()
      await screen.findByText('Sign in with Auth0')
      expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
      expect(container.querySelector('form')).toBeNull()
      const ssoOnlyText = container.querySelector('.login-sso-only-text')
      expect(ssoOnlyText).toHaveTextContent('Use your Auth0 account to sign in')
    })

    it('renders divider and both login methods when both sso_enabled and local_login_enabled are true', async () => {
      mockFetch.mockImplementation((url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/auth/config')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ sso_enabled: true, local_login_enabled: true, sso_provider_name: 'Google' }),
          } as Response)
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      })
      renderLogin()
      await screen.findByText('Sign in with Google')
      expect(screen.getByLabelText('Username')).toBeInTheDocument()
      expect(screen.getByLabelText('Password')).toBeInTheDocument()
      expect(screen.getByText('or')).toBeInTheDocument()
    })

    it('displays dismissible error banner when URL query contains ?error=sso_failed', async () => {
      mockFetch.mockImplementation((url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/auth/config')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ sso_enabled: true, local_login_enabled: false, sso_provider_name: 'Okta' }),
          } as Response)
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      })
      const { container } = render(
        <MemoryRouter initialEntries={['/login?error=sso_failed&error_description=SSO+was+cancelled']}>
          <Login onSuccessfulLogin={vi.fn()} />
        </MemoryRouter>,
      )
      await screen.findByText(/SSO was cancelled/)
      const banner = container.querySelector('.login-sso-error')
      expect(banner).toBeInTheDocument()
      const closeBtn = banner?.querySelector('button[aria-label="Dismiss error"]')
      expect(closeBtn).toBeInTheDocument()
      fireEvent.click(closeBtn!)
      await waitFor(() => {
        expect(container.querySelector('.login-sso-error')).not.toBeInTheDocument()
      })
    })

    it('falls back to local login when getAuthConfig() fails', async () => {
      mockFetch.mockImplementation(() => Promise.reject(new Error('network down')))
      renderLogin()
      // Should still show username/password fields
      const usernameInput = screen.getByLabelText('Username')
      const passwordInput = screen.getByLabelText('Password')
      expect(usernameInput).toBeInTheDocument()
      expect(passwordInput).toBeInTheDocument()
    })

    it('uses sso_enabled default false when config response is missing field', async () => {
      mockFetch.mockImplementation((url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/auth/config')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ sso_enabled: false, local_login_enabled: true, sso_provider_name: null }),
          } as Response)
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      })
      renderLogin()
      expect(screen.getByLabelText('Username')).toBeInTheDocument()
      expect(screen.queryByText(/Sign in with/i, { selector: 'button' })).not.toBeInTheDocument()
    })
  })
})
