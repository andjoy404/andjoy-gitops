# AndJoy GitOps — Backup & Restore Procedures

## Database Backup

### Full Backup (pg_dump)
```bash
# Export entire database
pg_dump -h <host> -p 5432 -U <user> -d <database> -F c -f andjoy-gitops-backup-YYYYMMDD.dump

# With encryption
pg_dump -h <host> -U <user> -d <database> -F c | openssl enc -aes-256-gcm -salt -pbkdf2 -out andjoy-gitops-backup-YYYYMMDD.dump.enc
```

### Schema Only
```bash
pg_dump -h <host> -U <user> -d <database> --schema-only -f andjoy-gitops-schema-YYYYMMDD.sql
```

### Data Only (no schema)
```bash
pg_dump -h <host> -U <user> -d <database> --data-only -F c -f andjoy-gitops-data-YYYYMMDD.dump
```

## Database Restore

### Restore from Full Dump
```bash
# Create new database
createdb -h <host> -U <user> <new_database_name>

# Restore
pg_restore -h <host> -U <user> -d <new_database_name> --clean --if-exists andjoy-gitops-backup-YYYYMMDD.dump

# Verify tables
psql -h <host> -U <user> -d <new_database_name> -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
```

### Restore from Schema Only
```sql
-- Connect to the target database
psql -h <host> -U <user> -d <database> -f andjoy-gitops-schema-YYYYMMDD.sql
```

## Post-Restore Validation

After any restore, run:
1. Verify tables exist: `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';`
2. Verify key table row counts: `SELECT count(*) FROM analytics_pipelines; SELECT count(*) FROM gitlab_projects;`
3. Start application and verify `/health` returns 200
4. Verify `/api/analytics/dashboard` returns data
5. Verify login still works (credentials unaffected)
6. Verify encrypted tokens remain decryptable (test an environment API call)

## Pre-Upgrade Checklist

Before upgrading the application:
1. [ ] Run full database backup
2. [ ] Verify backup file exists and is non-zero
3. [ ] Record current table row counts (for post-migration verification)
4. [ ] Document current version
5. [ ] Update `andjoy-gitops` image to new version
6. [ ] Proceed with upgrade procedure (see docs/operations/upgrade.md)
