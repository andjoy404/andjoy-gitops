# Security Documentation

## Authentication Model

- Cookie-based session authentication
- Session cookie: `gcd_session` (httpOnly=true, SameSite=Lax, Secure when SESSION_SECURE=true or profiles.active==production, path=/, Max-Age=3600s)
- Secure flag determined by OR logic: `SESSION_SECURE=true` OR `spring.profiles.active=="production"`
- Sessions stored in in-memory ConcurrentHashMap
- Session idle timeout: 8 hours (configurable via SESSION_IDLE_TIMEOUT_MINUTES)
- Session absolute timeout: 24 hours (configurable via SESSION_ABSOLUTE_TIMEOUT_HOURS)

## Password Hashing

- Argon2d (compatible with existing Rust app hashes)
- Salt: 16-byte SecureRandom
- Default params: m=65536, t=3, p=1
- Argon2d selected for legacy compatibility — Argon2id is more secure but incompatible with existing hashes

## Session Security

- Session IDs: 64-char hexadecimal (32 bytes from SecureRandom)
- No plaintext passwords or tokens stored in session objects
- Session invalidated on logout and password change
- Automatic cleanup: runs hourly via @Scheduled

## Encryption at Rest

- GitLab tokens encrypted with AES-256-GCM in database
- 32-byte key from ENVIRONMENT_TOKEN_ENCRYPTION_KEY (64 hex chars)
- 12-byte nonce, generated per encryption
- AES-GCM provides authenticated encryption (tamper detection)
- Key must be valid at startup or application fails

## CSRF Protection

- CSRF token required for all mutating requests (POST/PUT/PATCH/DELETE)
- Login, auth status, password change endpoints exempted
- Health and metrics endpoints exempted
- Token stored as XSRF-TOKEN cookie, sent as X-CSRF-TOKEN header

## Security Headers

- X-Content-Type-Options: nosniff
- X-Frame-Options: SAMEORIGIN
- Referrer-Policy: strict-origin-when-cross-origin
- Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none';
- Permissions-Policy: geolocation=(), microphone=(), camera=()

## Login Throttling

- Per-user: 5 login attempts per 60-second window
- Returns HTTP 429 (Too Many Requests) when throttled
- Successful login resets the counter
- Automatic cleanup of expired throttling records

## Secret Handling

- No secrets in source code or Docker image
- .env file excluded from version control
- Database passwords not logged
- Authorization headers not logged by default
- WebClient wire logging disabled in production

## TLS Expectations

- TLS termination at reverse proxy (nginx, cloud LB, etc.)
- Reverse proxy must forward X-Forwarded-Proto header
