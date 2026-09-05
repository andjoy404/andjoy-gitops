# Configuration reference

Copy `.env.example` to `.env`. Never commit the resulting `.env` file.

## Database

| Variable | Default | Required | Description |
|---|---:|:---:|---|
| `DB_HOST` | `postgres` | Yes | PostgreSQL hostname or Compose service name. |
| `DB_PORT` | `5432` | No | PostgreSQL port. |
| `DB_NAME` | `gitlab_ops` | Yes | Database name. |
| `DB_USER` | `gitlab_ops_user` | Yes | Database user. |
| `DB_PASSWORD` | — | Yes | Database password. Replace the example value. |
| `DATABASE_MAX_CONNECTIONS` | `10` | No | Maximum HikariCP connection-pool size. |

## Application and security

| Variable | Default | Required | Description |
|---|---:|:---:|---|
| `APP_PORT` | `8090` | No | Published application port. |
| `SPRING_PROFILES_ACTIVE` | `production` | No | Active Spring profile. |
| `ENVIRONMENT_TOKEN_ENCRYPTION_KEY` | — | Yes | 32-byte AES key encoded as 64 hexadecimal characters. |
| `SESSION_SECURE` | `false` | No | Set `true` when the browser reaches AndJoy GitOps through HTTPS. |
| `SESSION_IDLE_TIMEOUT_MINUTES` | `480` | No | Maximum idle session duration. |
| `SESSION_ABSOLUTE_TIMEOUT_HOURS` | `24` | No | Maximum total session duration. |
| `READ_ONLY` | `false` | No | Reject supported mutating operations. |
| `HIDE_WRITE_ACTIONS` | `false` | No | Hide write controls in the interface. |

Generate the encryption key with:

```bash
openssl rand -hex 32
```

Back up this key securely. Existing environment tokens cannot be decrypted after the key is lost or changed.

## Analytics and UI

| Variable | Default | Description |
|---|---:|---|
| `ANALYTICS_SYNC_INTERVAL_SECONDS` | `60` | Scheduled synchronization interval. |
| `ANALYTICS_RETENTION_DAYS` | `30` | Analytics retention period. |
| `PIPELINE_HISTORY_DAYS` | `90` | Maximum pipeline history window collected. |
| `DEFAULT_PAGE_SIZE` | `10` | Default number of table rows. |
| `PAGE_SIZE_OPTIONS` | `10,20,30,40,50` | Available table page sizes. |

## GitLab client

| Variable | Default | Description |
|---|---:|---|
| `GITLAB_API_TIMEOUT_SECONDS` | `30` | GitLab request timeout. |
| `GITLAB_MAX_CONCURRENT_REQUESTS` | `8` | Maximum concurrent GitLab requests. |
| `GITLAB_MAX_RETRIES` | `3` | Retry count for eligible transient failures. |

GitLab base URLs and tokens are stored per environment through **Settings → Environments**. Tokens are encrypted before storage. There is no global GitLab base URL environment variable in production configuration.

## Production recommendations

- Terminate TLS at a trusted reverse proxy or load balancer.
- Set `SESSION_SECURE=true`.
- Use unique secrets from a secret manager.
- Restrict PostgreSQL to the application network.
- Back up both PostgreSQL and the encryption key.
- Monitor `/health` and Prometheus metrics.
- Test upgrades against a restored backup before production rollout.

See [security operations](../operations/security.md), [backup and restore](../operations/backup-restore.md), and [deployment](../architecture/deployment.md).
