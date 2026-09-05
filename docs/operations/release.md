# Release process

AndJoy GitOps uses two GitHub Actions workflows:

- `Main branch CI` validates pushes and pull requests targeting `main`.
- `Version tag release` validates semantic version tags, publishes a container to GitHub Container Registry, and creates a GitHub Release with generated notes.

## Create a release

1. Ensure `main` is current and its CI run is successful.
2. Update [CHANGELOG.md](../../CHANGELOG.md) when the release needs curated notes.
3. Create and push a semantic version tag:

   ```bash
   git checkout main
   git pull --ff-only
   git tag -a v1.2.3 -m "AndJoy GitOps v1.2.3"
   git push origin v1.2.3
   ```

The tag must use `vMAJOR.MINOR.PATCH`; prerelease suffixes such as `v1.2.3-rc.1` are also accepted.

## Published artifacts

For `v1.2.3`, the workflow publishes:

- `ghcr.io/andjoy404/anjoy-gitops:1.2.3`
- `ghcr.io/andjoy404/anjoy-gitops:1.2`
- `ghcr.io/andjoy404/anjoy-gitops:1`
- `ghcr.io/andjoy404/anjoy-gitops:latest`
- a GitHub Release named `AndJoy GitOps v1.2.3`

The image is the same multi-stage application image used by Docker Compose: the React frontend is embedded in the Spring Boot application and runs as a non-root user.

## Manual retry

Open **Actions → Version tag release → Run workflow** and enter an existing version tag. The workflow validates the tag and checks out that exact revision; it does not release the current branch accidentally.

## Local verification

Before tagging, you can reproduce the principal checks locally:

```bash
cd frontend && npm ci && npm test && npm run build
cd ..
docker compose -f compose.test.backend.yaml up --abort-on-container-exit --exit-code-from test-runner
docker compose build
```

## Rollback

Deploy a previously published immutable version tag instead of rebuilding an old branch. Follow the [upgrade guide](upgrade.md) and restore a compatible database backup when a release includes irreversible database changes.
