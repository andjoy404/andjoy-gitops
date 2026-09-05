# AndJoy GitOps — Troubleshooting

## Compose Service Names
- App container: `andjoy-gitops-andjoy-gitops-1` (or `andjoy-gitops-andjoy-gitops-test-1` in test)
- PostgreSQL: `andjoy-gitops-postgres-1` (or `andjoy-gitops-postgres-test-1` in test)

## Common Issues

### Application Won't Start

**Check logs:**
```bash
docker compose logs andjoy-gitops
```

**Common causes:**

1. **Missing required environment variables**
   - Error: `DB_HOST environment variable is required`
   - Fix: Verify `.env` file is loaded with all required variables
   - Required: `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `ENVIRONMENT_TOKEN_ENCRYPTION_KEY`

2. **Database not listening**
   - Error: `Connection refused` or `CannotGetJdbcConnectionException`
   - Fix: Ensure PostgreSQL container is running: `docker compose up -d postgres`
   - Check ports: `docker compose ps`

3. **Flyway migration errors**
   - Error: `Migration Failed: SQL State 42701`
   - Fix: Check database version compatibility; verify Flyway baseline config

### Database Connection Failure

```bash
# Test connectivity from app container
docker compose exec andjoy-gitops bash -c "wget -qO- http://localhost:8090/"

# Test PostgreSQL directly
docker compose exec postgres psql -U gitlab_ops_user -d gitlab_ops -c "SELECT 1;"
```

### Flyway Migration Failure

**Symptoms:** Application fails to start with migration errors.

**Recovery:**
1. Check migration errors: `docker compose logs andjoy-gitops`
2. For baseline issues on existing databases:
   - Verify Flyway baseline is configured correctly
   - Check that `flyway.baseline-on-migrate=true` is set
3. For SQL syntax errors:
   - Compare migration SQL with PostgreSQL version
4. To skip migrations (for emergency start only):
   - Set `SPRING_FLYWAY_CHECK-ON-STARTUP=false`

### Login Failure

**"Login failed" error:**
- Verify credentials are correct in `app_users` table
- Argon2d hashes are Rust-compatible; verify hash format
- Check if user is locked or password expired

**Password change loop:**
- First-time users require password change (must_change_password=true)
- If stuck in loop, reset: `UPDATE app_users SET must_change_password=false WHERE username='admin';`

### 403 / CSRF Errors

**Symptoms:** POST/PUT requests return 403.

**Check:**
1. CSRF token endpoint: `GET /api/csrf`
2. X-CSRF-TOKEN header must be included in body requests
3. Verify session cookie `gcd_session` is present
4. Verify session cookie `gcd_session` is present

### GitLab Integration Errors

**GitLab 401 Unauthorized:**
- Verify the API token in the environment configuration
- Test manually: `curl -H "PRIVATE-TOKEN: <your-token>" https://gitlab.com/api/v4/user`

**GitLab 403 Forbidden:**
- Token may lack required scopes (api, read_api, read_repository)
- Check GitLab group/project visibility settings

**GitLab 429 Rate Limited:**
- Increase `GITLAB_MAX_CONCURRENT_REQUESTS` in `.env`
- Reduce concurrent requests via `GITLAB_MAX_CONCURRENT_REQUESTS`

**GitLab Timeout:**
- Increase `GITLAB_API_TIMEOUT_SECONDS` in `.env`
- Check network connectivity and GitLab API endpoint URL

### Sync Failure

**Symptoms:** No data appears in analytics dashboards.

**Check:**
```bash
# Enable debug logging for sync
docker compose logs andjoy-gitops | grep -i sync

# Verify sync is enabled
docker compose exec -it andjoy-gitops bash -c "cat /etc/andjoy-gitops/config/application.yml" | grep sync

# Verify environments configured
docker compose exec andjoy-gitops psql -U user -d gitlab_ops -c "SELECT * FROM environments;"
```

**Common causes:**
- No environments configured with API credentials
- Expired GitLab API token
- Network issues to GitLab
- `ANALYTICS_SYNC_INTERVAL_SECONDS` too frequent causing rate limits

**Trace missing data:**
- Missing projects: Check `GET /api/v4/groups/<id>/projects` returns data
- Missing pipelines: Check sync log for errors; verify `PIPELINE_HISTORY_DAYS` is sufficient
- Missing jobs: Jobs may be filtered out if not assigned to a pipeline

### Missing Pipelines / Jobs in Database

**Verify API returns data:**
```bash
# With the configured token
curl -H "PRIVATE-TOKEN: token" "https://gitlab.com/api/v4/projects/id/pipelines?per_page=10"
curl -H "PRIVATE-TOKEN: token" "https://gitlab.com/api/v4/projects/id/pipelines/1/jobs"
```

**If API returns data but DB is empty:**
1. Check sync logs for errors
2. Verify `SYNC_MAX_DEPTH > 1`
3. Verify `SYNC_FETCH_JOBS=true`

### Empty Analytics Data

If the API returns 200 but dashboards are empty:

1. Verify analytics endpoints:
   ```bash
   curl -b "gcd_session=SESSION_ID" http://localhost:8090/api/analytics/dashboard
   curl -b "gcd_session=SESSION_ID" http://localhost:8090/api/analytics/pipelines
   ```

2. Check database:
   ```bash
   docker compose exec postgres psql -U gitlab_ops_user -d gitlab_ops -c "SELECT count(*) FROM analytics_pipelines;"
   docker compose exec postgres psql -U gitlab_ops_user -d gitlab_ops -c "SELECT count(*) FROM analytics_summary;"
   ```

3. Force a sync and check logs:
   ```bash
   docker compose exec andjoy-gitops bash
   curl -X POST http://localhost:8090/api/sync/run
   exit
   docker compose logs -f andjoy-gitops
   ```

### Relations Map Missing Nodes

1. Verify graph API returns data:
   ```bash
   curl -b "gcd_session=SESSION_ID" http://localhost:8090/api/graph
   ```

2. Check if Cytoscape.js is loading correctly in browser DevTools Console

3. Check CSS z-index conflicts affecting node rendering

4. Verify project data exists in `gitlab_projects` table

### Metrics Unavailable

```bash
# Check if Prometheus endpoint exists
curl -b "gcd_session=SESSION_ID" http://localhost:8090/metrics/prometheus

# If 404, verify Actuator is enabled
docker compose exec andjoy-gitops bash -c "cat /etc/andjoy-gitops/config/application.yml | grep actuator"
```

**Required dependencies for metrics:**
- Micrometer Prometheus registry (enabled in pom.xml)
- Actuator endpoint exposed (`/actuator/prometheus`)
