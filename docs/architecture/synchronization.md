# AndJoy GitOps — Synchronization Architecture

## Components

- **SyncScheduler** (`@Scheduled`, fixedDelay=300s): Triggers sync by environment
- **AnalyticsSyncService**: Core sync logic per environment
- **AnalyticsSyncStorage**: jOOQ inserts/updates, upsert via ON CONFLICT
- **GitLabApiService**: GitLab REST API client (WebClient)
- **GitLabApiClient**: HTTP helper (WebClient, RestTemplate)
- **SyncOrchestrator**: Orchestrates sync across environments
- **AnalyticsRetentionCleanup**: Scheduled cleanup of old data

## Flow

1. `@Scheduled(fixedDelay=analytics.sync-interval-seconds * 1000)` fires
2. Fetches all enabled environments from `gitlab_environments`
3. For each environment: decrypt token, call GitLab API, persist results
4. Sync results: projects, pipelines, jobs, runners, user activity
5. On failure: logs error, next scheduled run retries

## Key Properties
- `analytics_sync_enabled`: Toggle (default true)
- `analytics_sync_interval_seconds`: Interval (default 300s)
- `analytics_retention_days`: Old data cleanup (default 30 days)
- Idempotent: existing data overwritten on re-sync
- Each environment syncs independently
- No distributed lock needed (single-process)
