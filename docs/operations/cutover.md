# AndJoy GitOps — Cutover Runbook

## Overview

This runbook guides a controlled deployment of AndJoy GitOps.
(the new Spring Boot/React application).

## Deployment Models

### Default (Recommended)
andjoy-gitops + bundled PostgreSQL (`docker compose up -d`)

### External PostgreSQL
andjoy-gitops + external PostgreSQL server

## Prerequisites

- Docker and Docker Compose installed
- Backup of current data (see Backup Procedures)
- Team notified of maintenance window

## Pre-Cutover

1. **Announce maintenance** — Notify users of planned downtime
2. **Record current version** — Run `curl https://old-host/api/version`
3. **Record image** — `docker images | grep andjoy-gitops`
4. **Verify disk capacity** — `df -h /var/lib/docker`
5. **Verify DB connectivity** — Test connection from deployment host
6. **Backup DB** — `pg_dump -h DB_HOST -U DB_USER -d DB_NAME -F c -f pre-cutover-backup.dump`
7. **Verify backup** — `pg_restore --list pre-cutover-backup.dump`
8. **Preserve current .env** — Copy old app config to safety
9. **Preserve encryption key** — Record ENVIRONMENT_TOKEN_ENCRYPTION_KEY
10. **Preserve old deployment config** — Save docker-compose.yml if custom

## Cutover Steps

### Default Installation (Bundled PostgreSQL)

1. **Stop writes** — Disable new sync or set READ_ONLY mode on old app
2. **Stop old app** — `docker-compose -f old-compose.yml down`
3. **Final DB backup** — `pg_dump -h DB_HOST -U DB_USER -d DB_NAME -F c -f cutover-backup-$(date +%Y%m%d-%H%M).dump`
4. **Prepare .env** — Copy `.env.example → .env`, fill in values
5. **Start new stack** — `docker compose up -d`
6. **Wait for health** — Monitor `docker compose ps` (both services healthy)
7. **Verify health** — `curl -s http://localhost:8090/health` → 200 OK
8. **Verify login** — Test admin login via UI or API
9. **Run API smoke tests**:
   ```
   curl http://localhost:8090/api/analytics/dashboard
   curl http://localhost:8090/api/pipelines?page=1&page_size=5
   curl http://localhost:8090/api/environments
   curl http://localhost:8090/api/users?page=1
   curl http://localhost:8090/api/config
   ```
10. **Run sync smoke** — Sync completes and data arrives

### External PostgreSQL Installation

1. **Stop writes** — Disable new sync or set READ_ONLY mode on old app
2. **Stop old app** — `docker-compose -f old-compose.yml down`
3. **Final DB backup** — `pg_dump -h DB_HOST -U DB_USER -d DB_NAME -F c -f cutover-backup-$(date +%Y%m%d-%H%M).dump`
4. **Verify DB connectivity** — Ensure `DB_HOST=<external-host>` resolves
5. **Start new container** — `docker compose up -d --scale postgres=0`
6. **Wait for health** — Monitor `curl -s http://localhost:8090/health`
7. **Verify login** — Test admin login via UI or API
8. **Run API smoke tests** (same as above)

## Post-Cutover

1. Monitor application logs for errors
2. Check Prometheus metrics for anomalies
3. Verify sync is running (`curl http://localhost:8090/api/config`)
4. Verify user access (login as test user)
5. Verify environments are visible
6. Verify dashboards show data
7. Verify Relations Map shows correct nodes/edges
8. Update DNS/routing if needed
9. Remove old app from registry if confirmed stable

## Monitoring Checklist

During first 24 hours:
- [ ] No 500 errors in logs
- [ ] Sync completing successfully every 60s
- [ ] Dashboard rendering without errors
- [ ] Pipelines data populated
- [ ] Users can login without issues
- [ ] Relations Map displaying correctly

## Rollback Decision Point

If any of these are true during post-cutover, initiate rollback:
- Login broken (auth issue)
- Data appears corrupted
- Sync fails repeatedly
- Major UI features missing

## Rollback Procedure

1. Stop new container: `docker compose down`
2. Restore DB: `pg_restore -h DB_HOST -U DB_USER -d DB_NAME cutover-backup.dump`
3. Start old app: `docker-compose -f old-compose.yml up -d`
4. Verify old app works
5. Preserve encryption key from new app (may differ)

# Important

## External PostgreSQL
If connecting to external PostgreSQL, ensure Flyway schema is baseline on existing
table structure (migrations from old app are compatible).

## Default Installation (Bundled PostgreSQL)
The default installation creates a fresh database. If migrating from the old app:
1. Backup old database first
2. Start new stack (`docker compose up -d`)
3. Restore data from backup

## Encryption Key
The DB_PASSWORD and ENVIRONMENT_TOKEN_ENCRYPTION_KEY are the same between apps.
If the encryption key changed during cutover, old AES-256-GCM tokens may fail
to decrypt. Preserve and verify compatibility.
