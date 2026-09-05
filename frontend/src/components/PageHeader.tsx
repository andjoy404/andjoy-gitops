import type { ReactNode } from 'react'

interface PageHeaderProps {
  icon: ReactNode
  title: string
  subtitle?: string
  actions?: ReactNode
}

export default function PageHeader({ icon, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="page-header-box">
      <div className="page-header-title">
        {icon}
        <div className="page-header-copy">
          <h2 className="page-header-title-text">{title}</h2>
          {subtitle ? <p className="page-header-subtitle">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </div>
  )
}
