# AndJoy GitOps — Authentication Architecture

## Flow

```
Browser → POST /api/auth/login → Backend validates → SessionStore.createSession → gcd_session cookie
         ← GET /api/auth/status ←           ← SessionStore.getSession ←      ← gcd_session cookie ←
```

## Components

- **AppUsers table**: Stores users with `password_hash` (Argon2d), `role` (admin/editor), `username`, `must_change_password`
- **AuthService**: Argon2d hashing/verification, Rust-compatible
- **SessionStore**: ConcurrentHashMap, 64-char hex tokens from SecureRandom
- **SessionAuthenticationFilter**: Reads `gcd_session` cookie, populates SecurityContext
- **PasswordChangeRequiredFilter**: Returns 403 when user has mustChangePassword=true
- **LoginAttemptStore**: Per-user throttle (5 attempts / 60s window)

## Cookie: `gcd_session`
httpOnly=true, Secure=(configurable), SameSite=Lax, Path=/

## Password Algorithm: Argon2d
Argon2d selected for full compatibility with Rust-generated Argon2d hashes.
Argon2id is more secure but incompatible — existing Rust app hashes would fail verification.

## Authorization Levels
- PUBLIC: login, status, analytics reads, pipelines, graph, runners, jobs
- AUTHENTICATED: environments read, config read, users list, preferences
- ADMIN (role=admin): environments write, users CRUD, config write, sync triggers
