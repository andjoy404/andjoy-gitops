<div align="center">
  <img src="docs/assets/andjoy-gitops-logo.svg" alt="AndJoy GitOps" width="120" height="120">

  # AndJoy GitOps

  **The modern, self-hosted operations dashboard for GitLab delivery, pipeline observability, and team analytics.**

  [![CI](https://github.com/andjoy404/anjoy-gitops/actions/workflows/ci.yml/badge.svg)](https://github.com/andjoy404/anjoy-gitops/actions/workflows/ci.yml)
  [![Java 21](https://img.shields.io/badge/Java-21-5c2d91?logo=openjdk&logoColor=white)](backend/pom.xml)
  [![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.4-6db33f?logo=springboot&logoColor=white)](backend/pom.xml)
  [![React 19](https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white)](frontend/package.json)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white)](frontend/package.json)
  [![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white)](docker-compose.yml)
  [![Docker](https://img.shields.io/badge/Docker-Compose-2496ed?logo=docker&logoColor=white)](docker-compose.yml)
  [![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

  [✨ Features](#-key-features) • [🚀 Quick Start](#-quick-start) • [🏛 Architecture](#-architecture) • [📖 Documentation](#-documentation) • [🤝 Contributing](CONTRIBUTING.md)
</div>

---

## 🌟 Key Features

**AndJoy GitOps** unifies delivery metrics across multiple GitLab instances into an ultra-fast, theme-aware operations control plane. Monitor deployment velocity, runner availability, contributor activity, and project dependencies in real-time.

| Feature | Description |
|---|---|
| 📊 **Unified Analytics** | Aggregated pipeline volume, success/failure ratios, durations, and delivery trends across monitored groups. |
| ⚡ **Pipeline Operations** | Full pipeline runs history, stage-level job DAG graphs, execution logs, artifact downloads, and retry/cancel actions. |
| 🏃 **Runner Fleet Management** | Real-time availability tracking, active job assignments, executor tags, and version inventories. |
| 👥 **User Contribution Analytics** | Leaderboards for pushes, merge requests, review comments, and issue interactions with CSV exports. |
| 🕸 **Relations Map** | Interactive force-directed Cytoscape graph tracing entity relationships from groups and projects to branches, pipelines, and jobs. |
| 🛡 **Multi-Tenant Isolation** | Namespace-isolated configuration routing, encrypted GitLab access tokens (AES-GCM-256), and session-based RBAC. |

---

## 🏛 Architecture

```mermaid
flowchart TD
    subgraph Client ["Client Tier"]
        UI["React 19 + TypeScript + Ant Design<br/>Vite • TanStack Query • Cytoscape.js"]
    end

    subgraph Service ["AndJoy GitOps Backend (Port 8090)"]
        API["Spring Boot 3.4 REST API & Actuator"]
        Sync["Background Sync Engine<br/>Rate-limited • Scoped Pollers"]
        Sec["Spring Security<br/>CSRF • AES-GCM Encryption • Sessions"]
    end

    subgraph Storage ["Persistence"]
        DB[("PostgreSQL 16<br/>Flyway Migrations • jOOQ")]
    end

    subgraph External ["Target Infrastructure"]
        GL1["GitLab Instance A<br/>(Cloud / Enterprise)"]
        GL2["GitLab Instance B<br/>(Self-Hosted)"]
    end

    UI <-->|Same-Origin REST + CSRF| API
    API <--> DB
    Sync <--> DB
    Sync -->|REST API with Encrypted Token| GL1
    Sync -->|REST API with Encrypted Token| GL2
```

---

## 🚀 Quick Start

### Prerequisites

- **Docker Engine** & **Docker Compose v2**
- A **GitLab Personal / Project Access Token** with `read_api` permission (or `api` if triggering pipeline actions)

### 1. Clone & Configure

```bash
git clone https://github.com/andjoy404/anjoy-gitops.git
cd andjoy-gitops

# Create production environment configuration
cp .env.example .env

# Generate a 64-character hex key for token encryption
openssl rand -hex 32
```

Update `.env` with your secure credentials:
```env
DB_PASSWORD=your_secure_db_password
ENVIRONMENT_TOKEN_ENCRYPTION_KEY=your_generated_64_hex_character_key
```

### 2. Start Services

```bash
# Using the helper script
./run.sh up

# Or directly with Docker Compose
docker compose up --build -d
```

Open [http://localhost:8090](http://localhost:8090) in your browser.

> [!NOTE]
> **Initial Login**: Sign in with `admin` / `admin`. You will be prompted to set a new password on your first sign-in.

### 3. Connect a GitLab Environment

1. Navigate to **Settings → Environments** in the sidebar.
2. Click **Add Environment**.
3. Provide your GitLab instance base URL (e.g. `https://gitlab.com`), access token, and group IDs to track.
4. Select the environment in the sidebar to begin automated analytics synchronization.

---

## 🛠 Management & CLI

The included `run.sh` script provides shortcuts for common lifecycle tasks:

```bash
./run.sh up         # Build and start services in the background
./run.sh logs       # Tail application container logs
./run.sh status     # Check container status and health
./run.sh restart    # Rebuild and restart application containers
./run.sh down       # Gracefully stop containers (preserves DB volume)
./run.sh clean      # Purge stopped containers, dangling images, and volumes
```

---

## ⚙️ Key Configuration Parameters

All runtime settings are configurable via environment variables in `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `APP_PORT` | `8090` | Web dashboard & API listening port |
| `DB_NAME` | `gitlab_ops` | PostgreSQL database name |
| `ENVIRONMENT_TOKEN_ENCRYPTION_KEY` | *Required* | 256-bit AES hex key for GitLab token encryption |
| `SESSION_SECURE` | `false` | Set to `true` when serving behind HTTPS |
| `ANALYTICS_SYNC_INTERVAL_SECONDS` | `60` | Cadence for background GitLab data sync |
| `ANALYTICS_RETENTION_DAYS` | `30` | Data retention cutoff for user events |
| `PIPELINE_HISTORY_DAYS` | `90` | Days of pipeline history collected on first sync |

See the full [Configuration Reference](docs/reference/configuration.md) for advanced tuning.

---

## 🧪 Development & Testing

### Local Toolchain

- **Backend**: Java 21 LTS, Maven 3.9+, PostgreSQL 16
- **Frontend**: Node.js 22 LTS, npm

```bash
# Frontend development
cd frontend
npm ci
npm run dev        # Dev server with proxy to backend

# Run frontend tests
npm test

# Backend tests
mvn -f backend/pom.xml test
```

For complete local setup, see the [Development Guide](docs/development.md).

---

## 📖 Documentation Index

- [Architecture Overview](docs/architecture/overview.md)
- [Code Map](docs/architecture/code-map.md)
- [GitLab Integration Details](docs/architecture/gitlab-integration.md)
- [Operations & Monitoring](docs/operations/monitoring.md)
- [Backup & Disaster Recovery](docs/operations/backup-restore.md)
- [Security Operations](docs/operations/security.md)
- [Troubleshooting Runbook](docs/operations/troubleshooting.md)

---

## 🛡 Security

To report security vulnerabilities, please refer to [SECURITY.md](SECURITY.md). Never post credentials, tokens, or security bugs in public issues.

---

## 📄 License

Licensed under the [Apache License, Version 2.0](LICENSE). Third-party components remain subject to their respective licenses.

*AndJoy GitOps is an independent project and is not affiliated with or endorsed by GitLab Inc.*
