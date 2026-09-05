# AndJoy GitOps — Upgrade Procedure

## Pre-Upgrade Checklist

- [ ] Current version: record (check `/api/version`)
- [ ] Latest DB backups: `pg_dump` completed and verified
- [ ] Table row counts: recorded for post-upgrade comparison
- [ ] New image available: `andjoy-gitops:<new_version>`
- [ ] Release notes reviewed: `CHANGELOG.md`

## Upgrade Steps

```bash
# 1. Backup the database (if not already done)
pg_dump -h DB_HOST -U DB_USER -d DB_NAME -F c -f backup-$(date +%Y%m%d).dump

# 2. Pull/load new image
docker pull andjoy-gitops:<new_version>
# OR (local build)
docker-compose build andjoy-gitops

# 3. Stop current container
docker-compose down

# 4. Start new container (Flyway migrations run automatically)
docker-compose up -d

# 5. Verify health
curl http://localhost:8090/health

# 6. Run functional smoke tests
curl http://localhost:8090/api/analytics/dashboard    # should return 200
curl http://localhost:8090/api/config                  # should return 200 (auth required)
curl http://localhost:8090                             # should return 200 (SPA)

# 7. Verify data integrity
curl http://localhost:8090/api/environments          # should return envs
curl http://localhost:8090/api/pipelines             # should return pipelines
```

## Post-Upgrade Checklist

- [ ] `/api/version` returns new version and commit
- [ ] `/health` returns 200
- [ ] API /analytics/dashboard returns data
- [ ] API /pipelines returns data
- [ ] API /config returns data
- [ ] SPA loads without errors
- [ ] Database row counts match expectations

## What Happens During Upgrade

1. Docker stops current container
2. New container starts with new image
3. Spring Boot initializes
4. Flyway runs any pending migrations
5. HikariCP connects to database
6. Tomcat starts on port 8090
7. /health returns 200 when ready

## Version Naming

Semantic versioning: MAJOR.MINOR.PATCH (-prerelease)

- `1.0.0` — First stable release
- `1.0.1` — Patch release (bug fixes only)
- `1.1.0` — Minor release (new features, backward compatible)
- `2.0.0` — Major release (breaking changes)
- `1.0.0-rc.1` — Release candidate (pre-stable)
