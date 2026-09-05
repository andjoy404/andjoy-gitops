# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0-rc.1] — 2026-08-14

### Added
- Independent Spring Boot and React implementation of the dashboard
- Dashboard with pipeline analytics, user activity, and global stats
- Pipelines page with pagination, search, and status filtering
- Relations Map with two layout modes (user-group, project-branch-pipeline)
- Environment configuration with GitLab token management
- User management (CRUD with role-based access)
- Settings/Global Config with company branding
- Favorites page with localStorage persistence
- Runners page showing running/idle/offline status
- GitLab synchronization engine with configurable intervals
- Analytics retention cleanup
- Prometheus metrics via Micrometer
- Health endpoint for container orchestration
- Password change on first login flow
- Multi-theme support (light/dark)
- CORS filter for development API proxying
- CSRF protection for mutating endpoints
- Session timeout (idle 8h, absolute 24h)
- Login brute-force throttling (5 attempts / 60s)
- Security headers (CSP, X-Content-Type-Options, Referrer-Policy)
- Bean validation on all request DTOs
- Global error handler preventing stack trace leakage
- AES-256-GCM encrypted token storage
- Argon2d password hashing (Rust-compatible)
- Non-root Docker container (uid 999)
- Read-only filesystem with tmpfs
- Multi-stage Docker build (Node → Maven → Eclipse Temurin JRE)
- Flyway baseline migration strategy for existing databases
- Build info endpoint (`/api/version`)
- Operations documentation (README, security, monitoring)

### Changed
- Database uses PostgreSQL only (no H2/MySQL compatibility hacks)
- jOOQ used for all database queries (type-safe)
- Docker image: Debian-based JRE for argon2-jvm glibc compatibility

### Security
- Session cookies: HttpOnly, Secure (configurable), SameSite=Lax
- CORS profile-based (development allows localhost:5173)
- Error responses never expose stack traces or internal details
- No secrets in Docker image or environment config files

[1.0.0-rc.1]: https://github.com/org/andjoy-gitops/compare/v0.0.1...v1.0.0-rc.1
