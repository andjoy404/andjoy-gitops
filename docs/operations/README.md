# AndJoy GitOps — Operations Guide

## Quick Start

```bash
# 1. Copy and edit .env
cp .env.example .env
# Edit: DB_PASSWORD, ENVIRONMENT_TOKEN_ENCRYPTION_KEY

# 2. Start
docker compose up -d

# 3. Verify
curl http://localhost:8090/health
```

## Configuration Variables

| Variable | Default | Description |
|---|---|---|
| DB_HOST | `postgres` | Compose service name; external host for external DB |
| DB_PORT | `5432` | PostgreSQL port |
| DB_NAME | `gitlab_ops` | Database name |
| DB_USER | `gitlab_ops_user` | PostgreSQL user |
| DB_PASSWORD | (required) | PostgreSQL password |
| DATABASE_MAX_CONNECTIONS | `10` | HikariCP pool max connections |
| ENVIRONMENT_TOKEN_ENCRYPTION_KEY | (required) | 64-hex AES-256-GCM key |
| APP_PORT | `8090` | Application HTTP port |
| SPRING_PROFILES_ACTIVE | `production` | Spring Boot profile |
| SESSION_SECURE | `false` | Secure cookie flag (`false`=HTTP, `true`=HTTPS) |
| SESSION_IDLE_TIMEOUT_MINUTES | `480` | Session idle timeout (minutes) |
| SESSION_ABSOLUTE_TIMEOUT_HOURS | `24` | Session absolute timeout (hours) |
| READ_ONLY | `false` | Disable write actions |
| HIDE_WRITE_ACTIONS | `false` | Hide edit/delete buttons in UI |
| ANALYTICS_SYNC_INTERVAL_SECONDS | `60` | Analytics sync interval |
| ANALYTICS_RETENTION_DAYS | `30` | Days to retain analytics data |
| PIPELINE_HISTORY_DAYS | `90` | Pipeline history window |
| DEFAULT_PAGE_SIZE | `10` | Default pagination page size |
| PAGE_SIZE_OPTIONS | `10,20,30,40,50` | Available page size options |
| GITLAB_API_TIMEOUT_SECONDS | `30` | GitLab API request timeout |
| GITLAB_MAX_CONCURRENT_REQUESTS | `8` | Max concurrent GitLab API requests |
| GITLAB_MAX_RETRIES | `3` | Max retries for transient errors |

## Architecture

**Default:** AndJoy GitOps + bundled PostgreSQL in Docker Compose

- `docker-compose.yml` defines both `postgres` and `andjoy-gitops` services
- `postgres` service: PostgreSQL 16, internal network only
- `andjoy-gitops`: Spring Boot + React SPA, port 8090 exposed
- Named volume `postgres-data` persists database
- Application connects via `DB_HOST=postgres` (Compose DNS name)

## External PostgreSQL

To use an external PostgreSQL server:

1. Set `DB_HOST=<external-host>` in `.env`
2. Run with disabled postgres service:
   ```bash
   docker compose up -d --scale postgres=0
   ```

## Shutdown

```bash
# Stop (data preserved in named volume)
docker compose down

# Resume
docker compose up -d

# WARNING: Stop and DELETE ALL data
docker compose down -v
```

`docker compose down -v` destroys the PostgreSQL volume and all data.

## First Login

The first launch creates an initial admin account automatically (when database is empty):

- **username:** `admin`
- **password:** `admin`

Login at `http://localhost:8090` and change the password immediately.

## Sync Troubleshooting

1. Check logs: `docker compose logs -f andjoy-gitops`
2. Verify config: `GET /api/config`
3. Trigger manual sync: `POST /api/sync/environments/<id>/sync`

## Auth Troubleshooting

- Default admin: `admin`/`admin` (first run only)
- Secure cookie flag controlled by `SESSION_SECURE` env var or `spring.profiles.active`
- For local HTTP: `SESSION_SECURE=false`
- For production HTTPS: `SESSION_SECURE=true`
- Session stored in-memory ConcurrentHashMap (lost on restart)
- Passwords: Argon2d (compatible with Rust app)

## PostgreSQL Password Behavior

The `POSTGRES_PASSWORD` environment variable only initializes the database user
password when the database volume is FIRST CREATED (first `docker compose up -d`
with an empty volume).

### Implications:

**Changing DB_PASSWORD in .env does NOT change the PostgreSQL user password in existing volumes.**

If you change `DB_PASSWORD` and restart, you will get:
```
FATAL: password authentication failed for user "gitlab_ops_user"
```

### Solutions:

**For development/UAT (disposable):**
```bash
docker compose down -v   # WARNING: deletes all data
docker compose up -d
```

**For production:** Use standard PostgreSQL password rotation:
1. Start with old password
2. Connect to database and run: `ALTER USER gitlab_ops_user WITH PASSWORD 'new_password';`
3. Change `.env` with new password
4. `docker compose up -d`

## Database Password Rotation Procedure

```bash
# 1. Connect to running database
docker compose exec postgres psql -U gitlab_ops_user -d gitlab_ops

# 2. Change password
ALTER USER gitlab_ops_user WITH PASSWORD 'new_secure_password';

# 3. Change .env with new password

# 4. Restart
docker compose down
docker compose up -d
```

## Data Persistence

| Command | Effect |
|---|---|
| `docker compose down` | Stops containers, **preserves data** |
| `docker compose up -d` | Starts containers from existing data |
| `docker compose down -v` | Stops containers, **deletes all data** |

**Never use `-v` in production** unless you intend to wipe the database.
