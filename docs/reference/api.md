# API reference

AndJoy GitOps exposes a same-origin JSON API under `/api`. The React application is its primary consumer.

## Authentication and CSRF

- Authentication uses the `gcd_session` HTTP-only cookie.
- Mutating requests require the CSRF token returned by `GET /api/csrf` and the corresponding request header.
- Admin-only routes return `403 Forbidden` to non-administrators.
- Never place credentials or GitLab tokens in URLs.

## Endpoint groups

| Area | Method and path | Purpose |
|---|---|---|
| Health | `GET /health` | Runtime health check. |
| Authentication | `GET /api/auth/status` | Current authentication state. |
| Authentication | `POST /api/auth/login`, `POST /api/auth/logout` | Start or end a session. |
| Authentication | `PUT /api/auth/password` | Change the current password. |
| CSRF | `GET /api/csrf` | Obtain CSRF state. |
| Configuration | `GET /api/config`, `GET /api/version` | Runtime and build information. |
| Environments | `GET, POST /api/environments` | List or create environments. |
| Environments | `PATCH, DELETE /api/environments/{id}` | Update or remove an environment. |
| Environments | `PATCH /api/environments/{id}/set-default` | Select the default environment. |
| Groups | `GET /api/groups` | Groups available in the selected environment. |
| Global config | `GET, PUT /api/global-config` | Read or update global UI configuration. |
| Analytics | `GET /api/analytics/readiness` | Scoped analytics readiness. |
| Analytics | `GET /api/analytics/summary` | Dashboard summary. |
| Analytics | `GET /api/analytics/pipelines` | Paginated pipeline analytics. |
| User activity | `GET /api/analytics/users` | Paginated user activity. |
| User activity | `GET /api/analytics/users/options` | User search options. |
| User activity | `GET /api/analytics/users/metrics` | Contribution metrics. |
| User activity | `GET /api/analytics/users/export` | CSV export. |
| Relations | `GET /api/analytics/user-project-relations` | User/project relationship data. |
| Graph | `GET /api/graph`, `GET /api/graph/cicd` | Relationship graphs. |
| Graph | `GET /api/graph/options` | Graph filter options. |
| Pipelines | `POST /api/pipelines/start` | Start a pipeline. |
| Pipelines | `POST /api/pipelines/retry`, `POST /api/pipelines/cancel` | Retry or cancel a pipeline. |
| Jobs | `GET /api/jobs`, `GET /api/jobs/batch` | Load pipeline jobs. |
| Artifacts | `GET /api/artifacts/job/{job_id}` | Download job artifacts. |
| Runners | `GET /api/runners` | Scoped runner inventory. |
| Preferences | `GET /api/preferences` | Current user preferences. |
| Preferences | `PUT /api/preferences/theme` | Persist theme preference. |
| Preferences | `PUT /api/preferences/favorites` | Persist favorites. |
| Synchronization | `POST /api/sync/trigger` | Trigger synchronization. |
| Synchronization | `POST /api/sync/status` | Read scoped synchronization status. |
| Synchronization | `POST /api/sync/refresh` | Trigger scoped refresh. |
| Users | `GET, POST /api/users` | List or create dashboard users. |
| Users | `PUT, DELETE /api/users/{id}` | Update or delete a dashboard user. |

## Compatibility

The API is application-internal and does not yet have an independently versioned public contract. Preserve response fields where possible, update frontend consumers in the same pull request, and add contract tests for changed behavior.

For payload details, consult DTOs under `backend/src/main/java/com/gitlabops/model/dto` and contract tests under `backend/src/test/java/com/gitlabops`.
