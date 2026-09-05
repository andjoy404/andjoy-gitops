# AndJoy GitOps — Deployment Architecture

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                       DEFAULT INSTALLATION                       │
│                                                                  │
│  ┌───────────────┐      ┌─────────────────────────────────┐      │
│  │ Browser (SPA) │ ───▶ │ docker-compose.yml              │      │
│  └───────────────┘      │                                 │      │
│                         │ andjoy-gitops (Spring Boot)        │      │
│                         │ ├─ React SPA (embedded)         │      │
│                         │ ├─ REST API                     │      │
│                         │ └─ Sync scheduler               │      │
│                         │          │                      │      │
│                         │          ▼                      │      │
│                         │ postgres:16-alpine              │      │
│                         │ └─ volume: postgres-data        │      │
│                         └─────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     EXTERNAL POSTGRESQL MODE                     │
│                                                                  │
│  ┌───────────────┐      ┌─────────────────────────────────┐      │
│  │ Browser (SPA) │ ───▶ │ docker-compose.yml              │      │
│  └───────────────┘      │ andjoy-gitops (Spring Boot)        │      │
│                         └─────────────────────────────────┘      │
│                                        │                         │
│                                        ▼                         │
│                            External PostgreSQL server            │
└──────────────────────────────────────────────────────────────────┘
```

## Default / Simple Configuration

The default installation bundles PostgreSQL inside Docker Compose. No external
database server is required.

### First Installation

```bash
# 1. Clone and enter the project
git clone <repo-url>
cd andjoy-gitops

# 2. Copy and edit environment file
cp .env.example .env
# Edit: DB_PASSWORD, ENVIRONMENT_TOKEN_ENCRYPTION_KEY

# 3. Start
docker compose up -d

# 4. Verify
docker compose ps
# Expected: postgres (healthy), andjoy-gitops (healthy)

# 5. Access
http://localhost:8090

# 6. Login
# username: admin
# password: admin
# Then immediately change the password
```

### Expected Behavior

1. PostgreSQL initializes (creates database, user)
2. PostgreSQL health check passes (pg_isready)
3. `andjoy-gitops` starts, connects to database
4. Flyway creates/baselines schema (31 migrations)
5. Application starts on port 8090
6. `/health` returns 200 when ready
7. Initial admin account created (admin/admin on empty DB)

### Data Persistence

PostgreSQL data is stored in a **named volume** (`postgres-data`).

```bash
# Stop — data is PRESERVED
docker compose down

# Restart — data is restored
docker compose up -d

# Stop and DELETE all data (WARNING)
docker compose down -v
```

`docker compose down -v` **DELETES** the PostgreSQL database volume and must only
be used when intentionally resetting the installation.

### Startup Sequence

1. `docker compose up -d` starts both services
2. PostgreSQL starts and initializes
3. Compose waits for PostgreSQL health check to pass
4. andjoy-gitops starts after PostgreSQL is healthy
5. HikariCP establishes connection
6. Flyway runs migrations (V1–V23)
7. InitialAdminBootstrapper runs (creates admin on empty DB)
8. Tomcat starts on port 8090
9. Health endpoint returns 200

### Port Configuration

| Service      | Port | Exposed to Host |
|--------------|------|-----------------|
| andjoy-gitops   | 8090 | YES (mapped via APP_PORT) |
| PostgreSQL   | 5432 | NO (internal only) |

PostgreSQL port 5432 is NOT published to the host by default. It is only
reachable through the internal Docker Compose network via the service DNS name
`postgres`.

### Environment Variables (Complete)

| Variable | Default | Compose Passed | Consumed By |
|----------|---------|----------------|-------------|
| DB_HOST | `postgres` | ✅ | spring.datasource.url |
| DB_PORT | `5432` | ✅ | spring.datasource.url |
| DB_NAME | `gitlab_ops` | ✅ | spring.datasource.url |
| DB_USER | `gitlab_ops_user` | ✅ | spring.datasource.username |
| DB_PASSWORD | (required) | ✅ | spring.datasource.password |
| DATABASE_MAX_CONNECTIONS | `10` | ✅ | DataSourceConfig → HikariCP |
| APP_PORT | `8090` | ✅ | docker port mapping |
| SPRING_PROFILES_ACTIVE | `production` | ✅ | SecurityHeaders/cookie logic |
| ENVIRONMENT_TOKEN_ENCRYPTION_KEY | (required) | ✅ | SecurityProperties |
| SESSION_SECURE | `false` | ✅ | AuthController cookie flag |
| SESSION_IDLE_TIMEOUT_MINUTES | `480` | ✅ | SessionStore |
| SESSION_ABSOLUTE_TIMEOUT_HOURS | `24` | ✅ | SessionStore |
| READ_ONLY | `false` | ✅ | AppConfig/Spring |
| HIDE_WRITE_ACTIONS | `false` | ✅ | AppConfig/Spring |
| DEFAULT_PAGE_SIZE | `10` | ✅ | UiProperties |
| PAGE_SIZE_OPTIONS | `10,20,30,40,50` | ✅ | UiProperties |
| ANALYTICS_SYNC_INTERVAL_SECONDS | `60` | ✅ | AnalyticsProperties |
| ANALYTICS_RETENTION_DAYS | `30` | ✅ | AnalyticsProperties |
| PIPELINE_HISTORY_DAYS | `90` | ✅ | AnalyticsProperties |
| GITLAB_API_TIMEOUT_SECONDS | `30` | ✅ | GitlabProperties |
| GITLAB_MAX_CONCURRENT_REQUESTS | `8` | ✅ | GitlabProperties |
| GITLAB_MAX_RETRIES | `3` | ✅ | GitlabProperties |

## Advanced: External PostgreSQL

Advanced users may connect to an external PostgreSQL server.

### Prerequisites

- PostgreSQL 16 (or compatible)
- Database created before starting andjoy-gitops
- Flyway schema baseline already applied (if migrating from old app)

### Configuration

```bash
# In .env, point to external host
DB_HOST=192.168.1.100
DB_PORT=5432
DB_NAME=gitlab_ops
DB_USER=gitlab_ops_user
DB_PASSWORD=<your-password>
```

### Disable the bundled PostgreSQL service

```bash
# Scale to zero (keeps existing postgres container)
docker compose up -d --scale postgres=0

# Or comment out/remove the "postgres:" service in docker-compose.yml
```

## Image

- Tagged: `andjoy-gitops:1.0.0-rc.1` (local)
- Multi-stage build:
  1. Frontend: Node 22 Alpine → npm ci + build
  2. Backend: Maven + Eclipse Temurin 21 → package + embed static/
  3. Runtime: Eclipse Temurin 21 JRE → java -jar app.jar

Image size: ~496 MB. Non-root user (appuser, uid 999).

## Runtime Hardening

Application container:
- Read-only root filesystem
- No new privileges (no-new-privileges:true)
- All capabilities dropped (cap_drop: ALL)
- Tmpfs mounted at /tmp (exec, nosuid, size=100m)
- Resource limits: 2 CPU, 1G memory
- Non-root runtime user (appuser, uid 999)
- Health check: wget against /health every 10s

PostgreSQL container:
- No port exposure to host
- Password authentication (credentials from .env via POSTGRES_PASSWORD)
- data volume: postgres-data (named, persistent)

## Session Cookie Security

The Secure flag on session cookies uses OR logic between two conditions:

1. **SESSION_SECURE env var**: Set to `true` when behind HTTPS
2. **spring.profiles.active**: Set to `production`

If either condition is true, the Secure flag is set.

**Default for local development/UAT:**
```
SESSION_SECURE=false
```
This ensures the login cookie works over `http://localhost:8090`.

**For production behind HTTPS:**
```
SESSION_SECURE=true
SPRING_PROFILES_ACTIVE=production
```

## Initial Administrator Account

When the database is first created (empty `app_users` table), the application
automatically creates a bootstrap administrator:

- **username:** `admin`
- **password:** `admin`
- **role:** admin
- **enabled:** true
- **must_change_password:** true

This account is created with a real Argon2d hash of "admin" — **never stored as plaintext**.

### IMPORTANT SECURITY

- The `admin/admin` credentials are **intentionally publicly documented**
- The first login will force a password change (must_change_password=true)
- The password is changed via the standard `/api/auth/password` endpoint
- Once changed, the account uses the new password
- On restart, the bootstrap check sees existing users and does nothing
- `docker compose down -v` resets the database, but bootstrap only creates admin
  when app_users is completely empty

## PostgreSQL Startup Timeout

PostgreSQL's `pg_isready` health check with `interval:10s` and `retries:10`
allows up to 110 seconds for PostgreSQL to become ready. This is sufficient for
fresh initialization (creating the database and roles).

## Docker Compose Variables

The Compose file passes all advertised variables into the application container.
The `.env` file at project root provides values for interpolation, and if a
variable is not present in `.env`, the `:-default` syntax in Compose provides fallbacks.

Variables marked with `:?variable is required` will cause docker compose up to fail
if not set, preventing silent deployment with missing credentials.
