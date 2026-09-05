# AndJoy GitOps — Database Architecture

## RDBMS: PostgreSQL 16

## Schema Groups

### Analytics Tables
| Table | Purpose | Key Indexes |
|---|---|---|
| `analytics_summary` | Aggregated daily stats | UNIQUE(group_id, date) |
| `analytics_pipelines` | Pipeline history | project_id, environment_id, merged_at |
| `analytics_jobs` | Job data | pipeline_id, user_name |
| `analytics_runners` | Runner state | environment_id |
| `analytics_user_activity` | User contributions | username, total_activity |
| `analytics_pipeline_stats` | Per-pipeline stats | pipeline_id |
| `analytics_global_stats` | Global totals | (single row) |
| `analytics_project_stats` | Per-project totals | project_id |

### Runner Snapshots
| Table | Purpose |
|---|---|
| `analytics_runner_snapshots` | Runner data snapshots |
| `analytics_runner_state` | Recent runner state |

### Runner Data
| Table | Purpose |
|---|---|
| `analytics_runners` | Runner records |
| `runner_snapshots` | Runnerrunner snapshots |

### Projects/Pipelines
| Table | Purpose |
|---|---|
| `analytics_pipelines` | Pipeline records |
| `analytics_jobs` | Job records |

### User & Auth
| Table | Purpose |
|---|---|
| `app_users` | Application users |
| `user_project_relations` | User ↔ project mapping |
| `gitlab_projects` | Cached project metadata |

### Configuration
| Table | Purpose |
|---|---|
| `gitlab_environments` | Environment configs (encrypted tokens) |
| `global_config` | App-wide settings |
| `app_user_preferences` | Per-user preferences |

## Notable Constraints
- AES-256-GCM encrypted tokens in `environment_token_ciphertext`
- Argon2d password hashes in `password_hash` (Rust-compatible)
- `namespace_group` composite key on `gitlab_projects`
- UNIQUE constraints on analytics summary tables for idempotent sync

## Backup & Migration
- Use PostgreSQL native tools: `pg_dump`, `pg_restore`
- Flyway with baseline-on-migrate enabled
- Old SQLX migrations NOT replayed; baseline at V1 for existing databases
- See `docs/operations/backup-restore.md` and `docs/migration/phase-09-database-migration-strategy.md`
