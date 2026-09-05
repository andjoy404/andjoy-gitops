# AndJoy GitOps — Frontend Code Map

## Pages (React Router routes)

| Route | Component | Data Source |
|---|---|---|
| `/` | `src/pages/Login.tsx` | POST `/api/auth/login` |
| `/login` | Redirect | Navigate to `/` (Home) |
| `/` (Home) | Redirect | Navigate to `/dashboard` via Settings |
| `/dashboard` | `src/pages/DashboardPage.tsx` | GET `/api/analytics/dashboard` |
| `/pipelines` | `src/pages/PipelinesPage.tsx` | GET `/api/pipelines` |
| `/user-activity` | `src/pages/UserActivityPage.tsx` | GET `/api/analytics/users` |
| `/user-activity/:id` | `src/pages/UserActivityPage.tsx` | GET `/api/analytics/users/:id` |
| `/relations-map` | `src/pages/RelationsMapPage.tsx` | GET `/api/graph` |
| `/environments` | `src/pages/EnvironmentsPage.tsx` | GET/POST `/api/environments` |
| `/users` | `src/pages/UsersPage.tsx` | GET/POST `/api/users` |
| `/global-config` | `src/pages/GlobalConfigPage.tsx` | GET/PUT `/api/config` (admin) |
| `/runners` | `src/pages/RunnersPage.tsx` | GET `/api/runners` |

## Shared Components

| File | Purpose |
|---|---|
| `src/components/Shell.tsx` | Main layout/sidebar with routing |
| `src/components/Header.tsx` | Top bar wrapper |
| `src/components/PasswordChangeModal.tsx` | Mandatory password change flow |
| `src/components/GroupSelector.tsx` | Group multi-select dropdown |
| `src/components/ErrorBoundary.tsx` | React error boundary |
| `src/components/FieldSearchBox.tsx` | Field search input |
| `src/components/SearchSuggestInput.tsx` | Autocomplete search input |
| `src/components/TablePaginator.tsx` | Data table pagination |
| `src/components/EnvironmentFormModal.tsx` | Environment create/update form |
| `src/components/AdminOnly.tsx` | Route guard for admin-only content |
| `src/components/AnalyticsLoadingGate.tsx` | Blocking analytics loading overlay |
| `src/components/EChartsWrapper.tsx` | ECharts integration wrapper |
| `src/components/PageHeader.tsx` | Standard page header |
| `src/components/Toast.tsx` | Toast notifications |
| `src/components/PipelineExchangeMark.tsx` | Pipelines icon mark |
| `src/components/DashboardMark.tsx` | Dashboard icon mark |
| `src/components/FolderMark.tsx` | Folder icon mark |
| `src/components/graph/RelationsGraphViewport.tsx` | Cytoscape relations graph viewport |

## Theme
- Providers: `KiloAntdProvider` in `main.tsx` (Ant Design ConfigProvider)
- CSS modules: `styles/globals.css`, `styles/overrides.css`, per-page module CSS
- Theme switch: Ant Design ConfigProvider with light/dark tokens

## Routing
- React Router v7 with HashRouter (hash-based SPA routing)
- Lazy-loaded route components via React.lazy() + Suspense

## Data Fetching
- TanStack Query (React Query) for all API calls
- QueryClientProvider at app level
- Credentials: 'include' for cookie-based auth
