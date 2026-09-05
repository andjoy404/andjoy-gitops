# Monitoring Documentation

## Health Endpoints

| Endpoint | Purpose | Auth Required |
|---|---|---|
| `/health` | Liveness — JVM alive | No |
| `/actuator/health` | Spring Boot actuator | No |

## Readiness

- Application reports ready when:
  - Spring context initialized
  - HikariCP connection pool active
  - Database reachable

## Liveness

- `/health` returns 200 if JVM process is alive
- No database requirement for liveness
- No GitLab API requirement for liveness

## Prometheus Metrics

```
GET /metrics/prometheus
```

Exposed metrics include:
- `http_server_requests_seconds` — HTTP request duration
- `jvm_*` — JVM metrics
- `hikaricp_*` — Connection pool metrics
- `gitlab_sync_*` — Sync execution metrics
- `gitlab_api_*` — GitLab API call metrics
- `http_server_requests_seconds_count{status=~"5.."}` — Server errors

## Recommended Alerts

| Alert | Condition | Severity |
|---|---|---|
| Sync Failures | `gitlab_sync_failures_total > 0` in 5m | Warning |
| GitLab API Down | No successful sync in 10m | Warning |
| Pool Exhaustion | `hikaricp_connections_active == pool_max` | Critical |
| High 5xx Rate | `http_server_requests_seconds_count{status=~"5.."} / count > 0.1` | Critical |
| Not Ready | `/actuator/health` returns DOWN | Critical |

## Log Levels

```
LOG_LEVEL_SECURITY=WARN  # Production
LOG_LEVEL_SECURITY=DEBUG # Troubleshooting
LOG_LEVEL_SECURITY=TRACE # Extreme debugging (NOT production)
```

**WARNING**: TRACE-level security logging may expose authorization headers.
