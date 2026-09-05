# AndJoy GitOps — Analytics Architecture

## Data Flow

```
GitLab REST API
       |
       v
AnalyticsSyncService.fetchProjects()
       |
       +--→ AnalyticsSyncStorage.saveProjects() → gitlab_projects
       |
       +--→ AnalyticsSyncService.fetchPipelines(project)
       |         |
       |         +--→ AnalyticsSyncStorage.savePipelines() → analytics_pipelines
       |         |
       |         +--→ AnalyticsSyncService.fetchJobs(pipeline)
       |                   |
       |                   +--→ AnalyticsSyncStorage.saveJobs() → analytics_jobs
       |
       +--→ AnalyticsSyncService.fetchRunners(group)
               |
               +--→ AnalyticsSyncStorage.saveRunners() → analytics_runners, analyzerunner_snapshots
```

## Aggregation

- `AnalyticsSummaryService` computes daily aggregated statistics
- Aggregations written to `analytics_summary` table (one row per group per date)
- Summary includes: total pipelines, successful pipelines, failed pipelines, average duration
- `AnalyticsService` reads aggregated data for the Dashboard endpoint

## Key Tables

| Table | Purpose | Update Frequency |
|---|---|---|
| `analytics_summary` | Pre-aggregated daily stats | Every sync run |
| `analytics_pipelines` | Raw pipeline data | Every sync run |
| `analytics_jobs` | Raw job data | Every sync run |
| `analytics_runners` | Runner state snapshots | Every sync run |
| `analytics_user_activity` | Per-user contribution counts | Every sync run |
| `analytics_pipeline_stats` | Statistics per pipeline | Every sync run |

## Retention

- `ANALYTICS_RETENTION_DAYS` controls how long historical data is kept
- Default: 30 days
- Cleanup runs as a scheduled task, deleting records older than the configured period

## Data Availability & Timestamp Quirks

- **User Activity Timestamps**: Standard GitLab user fields like `last_activity_on` in `analytics_users` are often unpopulated during API synchronization. To reliably determine a user's most recent activity timestamp, always query `MAX(occurred_at)` from the `analytics_user_events` table instead.
- **Pipeline Authors**: The `author_id` field in `analytics_pipelines` may be null depending on webhook/token scopes.
- **Metric Classification**:
  - *Period metrics*: Follow the selected time range (pipelines, success/failure runs, user contributions).
  - *Snapshot metrics*: Reflect current synchronized state (runner availability, active jobs).
  - *Inventory metrics*: Span all-time synchronized scope (group totals, project catalog, runner fleet).

