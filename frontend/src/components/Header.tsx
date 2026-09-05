import { Button } from 'antd'
import { GithubOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

interface HeaderProps {
  children?: React.ReactNode
  companyName?: string
  companyLogo?: string
}

export default function Header({ children, companyName, companyLogo }: HeaderProps) {
  const navigate = useNavigate()

  return (
    <header className="app-header">
      <div className="app-header-left">
        <span
          className="app-header-brand"
          onClick={() => navigate('/')}
        >
          {companyLogo ? (
            <img
              src={companyLogo}
              alt="Logo"
              style={{ width: 24, height: 24, objectFit: 'contain', marginRight: 8, display: 'inline-block', verticalAlign: 'middle' }}
            />
          ) : null}
          {companyName || 'AndJoy GitOps'}
        </span>
      </div>
      <div className="app-header-right">
        {children}
        <Button
            type="text"
            icon={<GithubOutlined />}
            href="https://github.com/andjoy404/anjoy-gitops"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="AndJoy GitOps repository on GitHub"
            title="View AndJoy GitOps on GitHub"
          >
            GitHub
        </Button>
      </div>
    </header>
  )
}
