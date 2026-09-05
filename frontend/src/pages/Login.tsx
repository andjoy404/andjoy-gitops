import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Input, Typography, message } from 'antd'
import { UserOutlined, LockOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons'
import type { AuthStatus } from '../types'
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
  const reducedMotion = usePrefersReducedMotion()

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
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-card-head">
            <Title level={3}>Welcome back</Title>
            <Text type="secondary">Sign in to continue</Text>
          </div>

          <div className="login-field">
            <label htmlFor="username">Username</label>
            <Input
              id="username"
              name="username"
              prefix={<UserOutlined />}
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <Input.Password
              id="password"
              name="password"
              prefix={<LockOutlined />}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
          </div>

          {error && <div className="login-error" role="alert">{error}</div>}

          <Button
            type="primary"
            block
            htmlType="submit"
            loading={loading}
            disabled={!username || !password}
          >
            Sign in
          </Button>
        </form>
      </div>
    </main>
  )
}
