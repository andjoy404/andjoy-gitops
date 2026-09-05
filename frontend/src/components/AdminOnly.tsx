import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Alert } from 'antd'
import { isAdminRole } from '../utils/role'

interface Props {
  children: ReactNode
}

export default function AdminOnly({ children }: Props) {
  if (typeof window === 'undefined') return null

  if (!isAdminRole(localStorage.getItem('user_role'))) {
    return (
      <div style={{ padding: '1.5rem' }}>
        <Alert
          message="Restricted Access"
          description="You need admin privileges to access this page."
          type="info"
          showIcon
        />
        <nav style={{ marginTop: '1rem' }}>
          <Routes>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </nav>
      </div>
    )
  }

  return <>{children}</>
}
