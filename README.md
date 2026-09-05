<div align="center">
  <img src="docs/assets/andjoy-gitops-logo.png" width="120" height="120" alt="AndJoy GitOps">

  # AndJoy GitOps

  **A polished, self-hosted operations dashboard for GitLab delivery, pipeline observability, and team analytics.**

  <a href="https://github.com/andjoy404/anjoy-gitops/actions/workflows/ci.yml"><img src="https://github.com/andjoy404/anjoy-gitops/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://shields.io"><img src="https://img.shields.io/badge/Java-21-5c2d91?logo=openjdk&logoColor=white" alt="Java 21"></a>
  <a href="https://shields.io"><img src="https://img.shields.io/badge/Spring_Boot-3.4-6db33f?logo=springboot&logoColor=white" alt="Spring Boot"></a>
  <a href="https://shields.io"><img src="https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white" alt="Node 22"></a>
  <a href="https://shields.io"><img src="https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql&logoColor=white" alt="PostgreSQL 16"></a>
  <a href="https://shields.io"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License Apache 2.0"></a>

  [✨ Features](#key-features) · [🚀 Quick Start](#quick-start) · [📸 Screenshots](docs/gallery/) · [📖 Docs](docs/) · [🤝 Contributing](CONTRIBUTING.md)
</div>

---

## ✨ Key Features

| Feature | Description |
| --- | --- |
| Unified Analytics | Aggregated pipeline volume, success/failure ratios, durations, and delivery trends across all monitored groups |
| Pipeline Operations | Full pipeline history, stage-level DAG graphs, execution logs, artifact downloads, and retry/cancel actions |
| Runner Fleet | Real-time availability tracking, active job assignments, executor tags, and version inventories |
| User Analytics | Leaderboards for pushes, merge requests, review comments, and issue interactions with CSV exports |
| Relations Map | Interactive force-directed graph tracing entity relationships from groups and projects to branches, pipelines, and jobs |
| Multi-Tenant | Namespace-isolated GitLab instance routing, encrypted credentials (AES-GCM-256), and session-based RBAC |

---

## 📸 Screenshots

[![AndJoy GitOps Dashboard](https://raw.githubusercontent.com/andjoy404/andjoy-gitops/main/docs/images/screenshots/01-dashboard-pipeline-analytics.png)](docs/gallery/index.html?utm_source=readme)

- **Dashboard — Pipeline Analytics** — summary metrics, trend charts, and active runner fleet
- **Dashboard — User Analytics** — contribution leaderboards and activity breakdowns
- **Pipeline List** — paginated pipeline runs with status badges and quick actions
- **Pipeline Detail** — stage-level DAG visualization with job logs
- **Runner Fleet** — real-time runner availability, active jobs, and executor inventories
- **Relations Map** — force-directed graph of group → project → pipeline → job relationships

👉 [**Open full gallery**](docs/gallery/index.html?utm_source=readme) — click any thumbnail for full-size view with keyboard navigation (←/→ arrows, Esc to close).

---

## 🚀 Quick Start

```bash
git clone https://github.com/andjoy404/anjoy-gitops.git
cd andjoy-gitops
cp .env.example .env
```

Edit `.env` with your database password and encryption key:

```env
DB_PASSWORD=your_secure_db_password
ENVIRONMENT_TOKEN_ENCRYPTION_KEY=your-generated-64-hex-character-key
```

Then start:

```bash
docker compose up -d
```

Open [http://localhost:8090](http://localhost:8090) and sign in with `admin` / `admin`.

---

## ⚙️ Configuration

All runtime settings are configurable via `.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_PORT` | `8090` | Web dashboard & API port |
| `DB_PASSWORD` | *Required* | PostgreSQL password |
| `ENVIRONMENT_TOKEN_ENCRYPTION_KEY` | *Required* | 256-bit hex key for GitLab token encryption |
| `SESSION_SECURE` | `false` | Set `true` behind HTTPS |
| `ANALYTICS_SYNC_INTERVAL_SECONDS` | `60` | Background sync cadence |
| `ANALYTICS_RETENTION_DAYS` | `30` | Data retention cutoff |
| `PIPELINE_HISTORY_DAYS` | `90` | First-sync pipeline history window |

See the full [Configuration Reference](docs/reference/configuration.md).

---

## 📖 Documentation

- [Architecture Overview](docs/architecture/overview.md)
- [Code Map](docs/architecture/code-map.md)
- [Database Schema](docs/architecture/database.md)
- [Deployment Guide](docs/architecture/deployment.md)
- [Security Operations](docs/operations/security.md)
- [Troubleshooting Runbook](docs/operations/troubleshooting.md)

---

## 🛡 Security

To report security vulnerabilities, please refer to [SECURITY.md](SECURITY.md). Never post credentials, tokens, or security bugs in public issues.

---

## 📄 License

Licensed under the [Apache License, Version 2.0](LICENSE). Third-party components remain subject to their respective licenses.

*AndJoy GitOps is an independent project and is not affiliated with or endorsed by GitLab Inc.*
