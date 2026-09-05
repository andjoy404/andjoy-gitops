# AndJoy GitOps — GitLab REST API Integration

## HTTP Client & Dynamic Routing

- `GitLabApiClient` — WebClient-based, connection-pooled, with retry backoff.
- **Dynamic Routing**: Base URLs and access tokens are resolved per selected environment from the database with AES-256-GCM decrypted tokens (never global static configuration).
- **ID Translation Boundary**:
  - *Internal / Federated IDs*: Used for application identity, PostgreSQL database keys, TanStack Query cache keys, and UI dropdowns.
  - *Native GitLab IDs*: Raw numeric IDs used exclusively for GitLab API requests and native ID display.
  - Federated IDs must never be transmitted directly to upstream GitLab API endpoints.
- Max concurrent requests: 8 (configurable via `GITLAB_MAX_CONCURRENT_REQUESTS`).

## Key Endpoints Used

| Resource | Endpoint | Method | Auth |
|---|---|---|---|
| Projects | `/api/v4/groups/{id}/projects` | GET | Private Token |
| Pipelines (by project) | `/api/v4/projects/{id}/pipelines` | GET | Private Token |
| Job logs | `/api/v4/projects/{id}/jobs/{id}/trace` | GET | Private Token |
| Runner groups | `/api/v4/groups/{id}/runners` | GET | Private Token |
| Runner details | `/api/v4/runners/{id}` | GET | Private Token |

## Response Data Persistence

- Projects → `gitlab_projects` (metadata)
- Pipelines → `analytics_pipelines`
- Jobs → `analytics_jobs`
- Runners → `analytics_runners`, `analytics_runner_snapshots`
- User activity → `analytics_user_activity` (derived from job assignee/project contributor)

## Pagination

- Default pages: 20 items per page
- Max pages: configurable
- Cursor-based when available; offset-based for GitLab
- Retries for rate limiting (429 → backoff, configurable max retries)
