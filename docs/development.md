# Development guide

## Toolchain

- Java 21 and Maven 3.9+
- Node.js 22 LTS and npm
- PostgreSQL 16 for integration/runtime testing
- Docker Compose v2

Production does not require host Java or Node installations because the Dockerfile provides both build environments.

## Frontend

```bash
cd frontend
npm ci
npm run dev
```

Validation:

```bash
cd frontend
npm test
npm run build
```

Focused example:

```bash
cd frontend
npx vitest run src/pages/RunnersPage.test.tsx
```

## Backend

Use Docker to guarantee Java 21 and PostgreSQL-compatible settings:

```bash
docker compose -f compose.test.backend.yaml up --abort-on-container-exit --exit-code-from test-runner
docker compose -f compose.test.backend.yaml down -v
```

With Java 21 and Maven installed locally:

```bash
mvn -f backend/pom.xml test
mvn -f backend/pom.xml -Dtest=FederatedGroupIdReadTest test
```

## Full application

```bash
cp .env.example .env
# Configure DB_PASSWORD and ENVIRONMENT_TOKEN_ENCRYPTION_KEY.
docker compose up --build -d
docker compose logs -f andjoy-gitops
```

## Repository layout

```text
backend/                         Spring Boot API, synchronization and migrations
frontend/                        React SPA, tests and styles
docs/                            Architecture, operations and reference documentation
test/fixtures/                   PostgreSQL runtime-test initialization
.github/                         CI and collaboration templates
```

## Engineering rules

- Keep native GitLab IDs at external GitLab API boundaries.
- Keep environment-scoped/internal IDs for database identity and cache isolation.
- Never log or return GitLab tokens.
- Preserve the selected environment and group in query keys.
- Add Flyway migrations for schema changes; never rewrite an applied migration.
- Prefer targeted tests before broad test suites.
- Do not commit `.env`, local agent configuration, build output, test output, or dependency directories.

## Pull-request validation

```bash
cd frontend && npm test && npm run build
cd ..
docker compose -f compose.test.backend.yaml up --abort-on-container-exit --exit-code-from test-runner
docker compose -f compose.test.backend.yaml down -v
docker build -t andjoy-gitops:verify .
```

Document checks that could not be run and explain why in the pull request.
