# Contributing to AndJoy GitOps

Thanks for helping improve AndJoy GitOps. Contributions should be focused, tested, and easy to review.

## Before you start

- Search [existing issues](https://github.com/andjoy404/anjoy-gitops/issues) before opening a new one.
- Use a feature request for user-visible behavior changes.
- Use GitHub's private security reporting flow for vulnerabilities; see [SECURITY.md](SECURITY.md).

## Local setup

1. Fork and clone the repository.
2. Copy `.env.example` to `.env` and set secure local values.
3. Start the stack:

   ```bash
   docker compose up --build -d
   ```

4. Open <http://localhost:8090>.

For native frontend and backend workflows, see [docs/development.md](docs/development.md).

## Development workflow

1. Create a branch from the default branch.
2. Keep changes scoped to one concern.
3. Add or update tests for changed behavior.
4. Run the relevant validation commands.
5. Open a pull request using the repository template.

Use conventional, imperative commit subjects when practical, for example:

```text
fix: refresh runner status after scoped sync
docs: document environment configuration
```

## Validation

Frontend:

```bash
cd frontend
npm ci
npm test
npm run build
```

Backend:

```bash
docker compose -f compose.test.backend.yaml up --build --abort-on-container-exit
```

Full container build:

```bash
docker compose build
```

## Pull request expectations

- Explain the problem and the chosen solution.
- Link related issues.
- Include screenshots for visual changes.
- Document configuration, API, or operational changes.
- Never commit credentials, tokens, `.env`, local databases, or generated build output.
- Submit only work you created or have the legal right to contribute under Apache-2.0.
- Do not copy source, assets, documentation, or protected branding from proprietary or incompatibly licensed projects.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
