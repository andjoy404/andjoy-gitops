import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Input, Typography, message, Spin } from 'antd'
import { UserOutlined, LockOutlined, EyeOutlined, EyeInvisibleOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import type { AuthConfig, AuthStatus } from '../types'
import logoAnimated from '../assets/andjoy-gitops-logo-animated-v2.gif'
import logoStatic from '../assets/andjoy-gitops-logo.png'
import '../styles/login.css'

const { Title, Text } = Typography

// Tracks the OS "reduce motion" preference so exactly one logo element is
// mounted: the animated GIF normally, the static PNG under reduced motion.
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}

export default function Login({ onSuccessfulLogin }: {
  onSuccessfulLogin: (data: AuthStatus) => void | Promise<void>
}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSSOError, setShowSSOError] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    fetch('/api/auth/config')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load auth config')
        return res.json()
      })
      .then((data: AuthConfig) => setAuthConfig(data))
      .catch((err) => {
        console.error('[Login] Failed to load auth config:', err)
        setAuthConfig({ sso_enabled: false, local_login_enabled: true, sso_provider_name: null })
      })
      .finally(() => {
        setConfigLoading(false)
      })
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password || loading) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      })

      if (res.ok) {
        const data: AuthStatus = await res.json()
        await fetch('/api/csrf', { credentials: 'include' }).catch(() => {})
        await onSuccessfulLogin(data)
        navigate('/dashboard', { replace: true })
      } else {
        const body = await res.text()
        let msg = 'Unable to sign in'
        try {
          const json = JSON.parse(body)
          msg = json.message || msg
        } catch { /* ignore */ }
        setError(msg)
      }
    } catch {
      setError('Network error — check backend connection')
    } finally {
      setLoading(false)
    }
  }, [username, password, loading, navigate, onSuccessfulLogin])

  const ssoEnabled = authConfig?.sso_enabled ?? false
  const localLoginEnabled = authConfig?.local_login_enabled ?? true
  const ssoProviderName = (!authConfig?.sso_provider_name || authConfig.sso_provider_name === 'https')
    ? 'SSO'
    : authConfig.sso_provider_name

  useEffect(() => {
    setShowSSOError(searchParams.get('error') === 'sso_failed')
  }, [searchParams])

  const showError = searchParams.get('error') === 'sso_failed'
  const ssoErrorValue = searchParams.get('error_description') || 'SSO sign-in was cancelled or failed. Please try again.'

  return (
    <main className="login-page">
      <div className="login-stand">
        <div className="login-brand-lockup">
          <div className="login-logo">
            {reducedMotion ? (
              <img
                className="login-logo-static"
                src={logoStatic}
                alt="AndJoy GitOps"
                width={160}
                height={160}
              />
            ) : (
              <img
                className="login-logo-animated"
                src={logoAnimated}
                alt="AndJoy GitOps"
                width={160}
                height={160}
              />
            )}
          </div>
          <div className="login-product-name">AndJoy GitOps</div>
        </div>
        <div className="login-card">
          <div className="login-card-head">
            <Title level={3}>Welcome back</Title>
            <Text type="secondary">Sign in to continue</Text>
          </div>

          {/* Login card content: hide while auth config is loading to prevent form flickering */}
          {configLoading ? (
            <div style={{ minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spin size="large" />
            </div>
          ) : (
            <>
              {showSSOError && (
                <div className="login-error login-sso-error" role="alert">
                  <span>{error || ssoErrorValue}</span>
                  <button
                    type="button"
                    className="login-error-close"
                    onClick={() => {
                      setShowSSOError(false)
                      setError('')
                    }}
                    aria-label="Dismiss error"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* SSO Button */}
              {ssoEnabled && localLoginEnabled && (
                <Button
                  type="primary"
                  block
                  icon={<SafetyCertificateOutlined />}
                  href="/oauth2/authorization/oidc"
                  size="large"
                  className="login-sso-btn"
                >
                  Sign in with {ssoProviderName}
                </Button>
              )}

              {ssoEnabled && !localLoginEnabled && (
                <div className="login-sso-only-block">
                  <Button
                    type="primary"
                    block
                    icon={<SafetyCertificateOutlined />}
                    href="/oauth2/authorization/oidc"
                    size="large"
                    className="login-sso-btn login-sso-btn-only"
                  >
                    Sign in with {ssoProviderName}
                  </Button>
                  <p className="login-sso-only-text">
                    Use your {ssoProviderName} account to sign in
                  </p>
                </div>
              )}

              {/* Divider when both are shown */}
              {ssoEnabled && localLoginEnabled && (
                <div className="login-divider">
                  <span>or</span>
                </div>
              )}

              {/* Password form - only when local login is enabled */}
              {localLoginEnabled && (
                <form onSubmit={handleSubmit}>
                  <div className="login-field">
                    <label htmlFor="username">Username</label>
                    <Input
                      id="username"
                      name="username"
                      prefix={<UserOutlined className="login-input-icon-user" />}
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoFocus={!ssoEnabled || !localLoginEnabled}
                    />
                  </div>

                  <div className="login-field">
                    <label htmlFor="password">Password</label>
                    <Input.Password
                      id="password"
                      name="password"
                      prefix={<LockOutlined className="login-input-icon-pass" />}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                    />
                  </div>

                  {!showSSOError && error && <div className="login-error" role="alert">{error}</div>}

                  <Button
                    type="primary"
                    block
                    htmlType="submit"
                    loading={loading}
                    disabled={!username || !password}
                    size="large"
                  >
                    Sign in
                  </Button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}
