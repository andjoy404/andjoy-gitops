# AndJoy GitOps — Backend Code Map

## Key packages and ownership

### Authentication
- Controller: `com.gitlabops.controller.AuthController`
- Service: `com.gitlabops.service.AuthService` (Argon2d hashing/verification)
- Session: `com.gitlabops.service.SessionStore` (in-memory ConcurrentHashMap)
- Throttling: `com.gitlabops.service.LoginAttemptStore`
- Filters: `SessionAuthenticationFilter`, `PasswordChangeRequiredFilter`
- Security: `com.gitlabops.config.SecurityConfig`

### API Config
- Controller: `com.gitlabops.controller.ConfigController` (GET /api/config, /api/version)
- Models: `UiProperties`, `AnalyticsProperties`

### Environments
- Controller: `com.gitlabops.controller.EnvironmentController`
- Service: `com.gitlabops.service.EnvironmentService` (AES-256-GCM encryption)
- Repository: `com.gitlabops.repository.EnvironmentRepository`
- DTO: `EnvironmentCreateRequest`, `EnvironmentUpdateRequest`, `EnvironmentDTO`

### Analytics
- Controller: `com.gitlabops.controller.AnalyticsController` (summaries, users, pipeline stats)
- Service: `com.gitlabops.service.AnalyticsService`
- Sync: `com.gitlabops.service.AnalyticsSyncService`, `AnalyticsSyncStorage`
- Repo: `AnalyticsRepository` (jOOQ)

### Pipelines
- Controller: `com.gitlabops.controller.PipelineController`
- Model: `PaginatedPipelineResponse`, `ProjectPipeline`, `GitlabPipeline`
- Repo: `PipelineRepository`
- DTOs: `GitlabProject`, `GitlabPipeline`, `GitlabJob`, `GitlabRunner`
- Service: `com.gitlabops.service.JobService` (job data)

### Runner State
- Controller: `com.gitlabops.controller.RunnersController`
- Model: `GitlabRunner`, RunnerWithJobs
- Repo: `RunnerRepository`, `AnalyticsRepository`

### User Activity & Relations
- Controller: `com.gitlabops.controller.GraphController`, `AnalyticsController` methods
- Service: `com.gitlabops.service.GraphService`
- Repo: `UserActivityRepository`, `UserProjectRelationRepository`
- Model: `UserActivity`, `UserProjectRelation`, `AppUserDTO`

### Users (app_users CRUD)
- Controller: `com.gitlabops.controller.UsersController`
- Service: `com.gitlabops.service.UserService`, `UsersService`
- Repo: `com.gitlabops.repository.AppUserRepository`

### Settings / Preferences
- Controller: `com.gitlabops.controller.PreferencesController`
- Repo: PreferencesRepository

### Sync Engine
- Scheduler: `com.gitlabops.service.SyncScheduler` (@Scheduled)
- Service: `com.gitlabops.service.AnalyticsSyncService`
- Storage: `com.gitlabops.service.AnalyticsSyncStorage`
- API Client: `com.gitlabops.service.GitLabApiClient` (WebClient, RestTemplate)
- Legacy API Client: `com.gitlabops.service.GitLabClient` (RestTemplate)
- Controller: `com.gitlabops.controller.SyncController`
- Metrics: `com.gitlabops.service.SyncMetrics`

### Global Configuration
- Controller: `com.gitlabops.controller.GlobalConfigController`
- Service: `com.gitlabops.service.GlobalConfigService`
- Repo: `com.gitlabops.repository.GlobalConfigRepository`
- Model: `GlobalConfigRequest`, `GlobalConfigDTO`, `ApiConfigResponse`

### Security/Encryption
- `com.gitlabops.service.EncryptionService` (AES-256-GCM)
- `com.gitlabops.config.SecurityConfig` (Spring Security filter chain)
- `com.gitlabops.config.WebClientConfig` (WebClient, RestTemplate beans)
- `com.gitlabops.config.DatabaseProperties` (HikariCP settings)

### Error Handling
- `com.gitlabops.error.GlobalExceptionHandler` (no stack traces)

### Configuration
- `SecurityProperties`, `UiProperties`, `AnalyticsProperties`, `GitlabProperties`, `SyncConfig`, `CorsFilterConfig`, `StartupValidator` (configuration validation)
