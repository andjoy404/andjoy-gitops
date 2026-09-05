import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import App from './App'
import '@fontsource-variable/montserrat'
import '@fontsource-variable/geist-mono'
import './styles/globals.css'
import './styles/overrides.css'
import './styles/environments.css'
import './styles/summary-bar.css'
import './styles/relations.css'
import './styles/dashboard.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

export default function KiloAntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        token: {
          fontFamily: "'Montserrat Variable', system-ui, -apple-system, sans-serif",
          colorBgContainer: '#ffffff',
          colorText: '#202331',
        },
        components: {
          Checkbox: {
            colorPrimary: '#7c5ac7',
          },
        },
      }}
    >
      {children}
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <KiloAntdProvider>
          <App />
        </KiloAntdProvider>
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
