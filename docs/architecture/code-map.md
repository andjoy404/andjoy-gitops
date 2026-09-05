# Current code map

| Feature | Frontend | Backend | Representative tests |
|---|---|---|---|
| Routes | `frontend/src/App.tsx` | `GitLabOpsApplication.java`, `StaticResourcesConfig.java` | `App.test.tsx` |
| Shell/navigation | `components/Shell.tsx`, `components/Header.tsx`, `contexts/GroupContext.tsx` | `ConfigController.java`, `PreferencesController.java` | `Shell.test.tsx` |
| Authentication | `pages/Login.tsx`, `components/PasswordChangeModal.tsx` | `AuthController.java`, `AuthService.java`, `SessionStore.java` | `AuthControllerTest.java` |
| Dashboard | `pages/DashboardPage.tsx` | `AnalyticsController.java`, `AnalyticsService.java` | `DashboardPage.test.tsx`, `AnalyticsContractTest.java` |
| Pipelines/jobs | `pages/PipelinesPage.tsx`, `components/FieldSearchBox.tsx`, `services/favorites.ts` | `PipelineController.java`, `JobService.java`, `GitLabApiClient.java`, `PreferencesController.java` | `PipelinesPage.test.tsx` |
| Runners | `pages/RunnersPage.tsx` | `RunnersController.java`, `AnalyticsService.java` | `RunnersPage.test.tsx` |
| User activity | `pages/UserActivityPage.tsx` | `AnalyticsController.java`, `AnalyticsService.java` | `UserActivityPage.test.tsx`, `UserActivityContractTest.java` |
| Relations Map | `pages/RelationsMapPage.tsx`, `components/graph/RelationsGraphViewport.tsx` | `GraphController.java`, `GraphService.java` | graph and Relations Map tests |
| Environments/groups | `pages/EnvironmentsPage.tsx`, `components/EnvironmentFormModal.tsx`, `components/GroupSelector.tsx` | `EnvironmentController.java`, `EnvironmentService.java`, `GroupService.java` | environment and multi-environment tests |
| Users | `pages/UsersPage.tsx`, `components/AdminOnly.tsx` | `UsersController.java`, `AppUserRepository.java` | `UsersPage.test.tsx` |
| Global config | `pages/GlobalConfigPage.tsx` | `EnvironmentController.java`, `EnvironmentRepository.java` | `GlobalConfigPage.test.tsx` |
| Scoped refresh | `hooks/useSyncRefresh.ts`, `services/scopeQueries.ts` | `SyncController.java`, `AnalyticsSyncService.java` | refresh/readiness tests |
| GitLab integration | `services/api.ts` | `GitLabApiClient.java`, `GitLabClient.java`, `FederatedIdUtility.java` | sync/federated ID tests |
| Database | — | `repository/*`, `resources/db/migration/V*` | repository and Flyway tests |

## Backend packages

- `config/` — application, security, database, scheduling, metrics and startup validation.
- `controller/` — HTTP contracts and authorization boundaries.
- `service/` — authentication, GitLab clients, synchronization, analytics, graphs and encryption.
- `repository/` — PostgreSQL/jOOQ persistence.
- `model/dto/` — request and response contracts.
- `util/` — environment-scoped ID utilities.

## Frontend areas

- `pages/` — route-level screens.
- `components/` — shared controls, chrome, modals, pagination and graph rendering.
- `hooks/` — theme and scoped synchronization lifecycle.
- `services/` — API transport, favorites and query invalidation.
- `contexts/` — selected environment/group state.
- `styles/` — global tokens and component/page styles.
