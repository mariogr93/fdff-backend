# NestJS Authentication Changelog

**Audience:** FDFF backend team  
**Repository:** `fdff-backend`  
**Last updated:** June 2026

This document records what changed in the IAM module during the authentication hardening initiative: new files, modified behavior, 
why we added throttling and DTO validation, how dual-token issuance works, and how the HttpOnly cookie handshake is executed at the HTTP layer.

For the full engineering source of truth (architecture, ports, guards, env matrix), see [`README-IAM.md`](./README-IAM.md).

---

## Summary

We evolved the IAM vertical slice from basic register/login into an enterprise-grade credential and session system:

1. **Signup hardening** — `class-validator` DTOs with password entropy rules aligned to the React Zod schema; route-level throttling on registration.
2. **Login security** — bcrypt password verification (12 salt rounds), timing-safe unknown-email handling, account lockout, `APPROVED`-only login.
3. **Dual-token model** — Short-lived RS256 access JWT in JSON; long-lived opaque refresh token in an HttpOnly cookie.
4. **Refresh endpoint** — `POST /api/auth/refresh` validates the cookie, rotates the refresh token hash in PostgreSQL, and issues a new access token.
5. **Platform wiring** — `cookie-parser`, CORS with credentials, global `ValidationPipe`, RS256 key loading from PEM files.

**Password hashing note:** The architecture blueprint mentions Argon2 as an option. The shipped implementation uses **bcrypt** 
(with a SHA-256 pre-hash step) via `BcryptPasswordHasher`. This is the active adapter bound in `iam.module.ts`.

---

## Why We Implemented Throttling and DTOs

### DTOs (`class-validator` + global `ValidationPipe`)

**Problem:** Raw request bodies reach controllers without structure. Attackers can send oversized payloads, unexpected fields, 
or weak passwords that waste CPU on hashing and DB writes.

**Solution:** Every auth endpoint accepts a typed DTO. `main.ts` registers a global `ValidationPipe` with:

| Option | Effect |
|--------|--------|
| `whitelist: true` | Strips properties not decorated in the DTO |
| `forbidNonWhitelisted: true` | Rejects requests that include unknown fields |
| `transform: true` | Coerces types and runs `@Transform()` decorators |

**Register-specific rules** (`RegisterAccountDto`):

- Email: `@IsEmail()`, max 100 chars, trimmed and lowercased
- Password: 8–20 chars + `@IsPasswordStrong()` (uppercase, lowercase, digit, special — mirrors frontend)
- Role: optional `@IsEnum(UserRoles)`, defaults to `ATHLETE`

**Login rules** (`LoginDto`):

- Email + password length bounds only — **no entropy check** on login (existing accounts may predate the signup policy)

DTO validation runs **before** use cases execute. Invalid input returns `400 Bad Request` without touching bcrypt or the database.

### Throttling (`@nestjs/throttler`)

**Problem:** Public auth endpoints are ideal targets for credential stuffing, registration spam, and refresh-token brute force.

**Solution:** Two layers of rate limiting:

| Layer | Config | Scope |
|-------|--------|-------|
| **Global** | 100 requests / minute per IP | All routes (`ThrottlerGuard` in `app.module.ts`) |
| **Route** | Per-endpoint overrides on `AuthController` | Auth-specific limits |

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /auth/register` | 10 | 1 hour |
| `POST /auth/login` | 5 | 1 minute |
| `POST /auth/refresh` | 10 | 1 minute |

Throttling is applied at the **controller** layer via `@Throttle()`. It complements — but does not replace — 
login lockout logic inside `LoginAccountUseCase` (5 failed attempts → 15-minute account lock).

---

## Files Added or Changed

### Application bootstrap

| File | Change |
|------|--------|
| `src/main.ts` | Added `cookieParser()`; global prefix `api`; CORS with `credentials: true` and `FRONTEND_URL`; `helmet()`; global `ValidationPipe` and `DomainExceptionFilter` |
| `src/app.module.ts` | `ThrottlerModule` (100/min) + global `ThrottlerGuard` |
| `.env.example` | RS256 key paths, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_DAYS`, `SALT_ROUNDS`, `FRONTEND_URL` |

### IAM — presentation (HTTP)

| File | Change |
|------|--------|
| `src/iam/presentation/auth.controller.ts` | `POST /auth/register`, `/auth/login`, `/auth/refresh`; throttling; cookie set on login and refresh |
| `src/iam/presentation/dtos/register-account.dto.ts` | Register validation + `@IsPasswordStrong()` |
| `src/iam/presentation/dtos/login.dto.ts` | Login validation |

### IAM — application (use cases & ports)

| File | Change |
|------|--------|
| `src/iam/application/use-cases/register-account.use-case.ts` | Account creation with bcrypt hash |
| `src/iam/application/use-cases/login-account.use-case.ts` | Credential verify, lockout, refresh token generation, access JWT |
| `src/iam/application/use-cases/refresh-account.use-case.ts` | **New** — cookie token validation, rotation, new access JWT |
| `src/iam/application/ports/account.repository.interface.ts` | Added `findByRefreshTokenHash()` |

### IAM — domain

| File | Change |
|------|--------|
| `src/iam/domain/account.model.ts` | `refreshTokenHash` field on aggregate |
| `src/iam/domain/exceptions/invalid-refresh-token.exception.ts` | **New** — 401 when refresh is invalid |

### IAM — infrastructure

| File | Change |
|------|--------|
| `src/iam/infrastructure/security/jwt-key.util.ts` | **New** — load RS256 PEM key pair from disk or env |
| `src/iam/infrastructure/security/jwt-token.service.ts` | RS256 sign/verify via `@nestjs/jwt` |
| `src/iam/infrastructure/security/jwt.strategy.ts` | Passport JWT strategy (Bearer extraction) |
| `src/iam/infrastructure/security/auth-cookie.util.ts` | **New** — `buildRefreshTokenCookieOptions()` |
| `src/iam/infrastructure/security/bcrypt-password-hasher.ts` | bcrypt adapter, `SALT_ROUNDS` default 12 |
| `src/iam/infrastructure/persistence/account.orm-entity.ts` | `refresh_token_hash` column |
| `src/iam/infrastructure/persistence/typeorm-account.repository.ts` | `findByRefreshTokenHash()` implementation |
| `src/iam/iam.module.ts` | JWT module (RS256), use cases, port bindings |

### Shared cross-cutting

| File | Change |
|------|--------|
| `src/iam/infrastructure/security/refresh-token.util.ts` | **New** — `generateRefreshToken()`, `hashRefreshToken()` (SHA-256) |
| `src/shared/validators/password-strength.validator.ts` | **New** — `@IsPasswordStrong()` custom validator |
| `src/shared/guards/register-role.guard.ts` | Blocks privileged role registration without admin JWT |
| `src/shared/guards/jwt-auth.guard.ts` | Passport guard (ready for protected routes) |
| `src/shared/database/seeds/001-initial-setup.sql` | `refresh_token_hash VARCHAR(64)` on `accounts` |

---

## Dual-Token Generation (Access + Refresh)

The system issues **two credentials** on successful login. They have different formats, lifetimes, storage, and purposes.

### Access token (JWT, RS256)

| Property | Value |
|----------|-------|
| Format | JWT signed with **RS256** (asymmetric) |
| Private key | `keys/jwt-private.pem` (signing only on server) |
| Public key | `keys/jwt-public.pem` (verification by API / future services) |
| TTL | `JWT_EXPIRES_IN` (default **15 minutes**) |
| Claims | `sub` (account UUID), `email` |
| Delivery | **JSON response body** — `{ accessToken, accountId, role }` |
| Storage (client) | React in-memory only — never persisted by our SPA |

**Generation path:**

```
LoginAccountUseCase.execute()
  → tokenService.sign({ id, email })
    → JwtTokenService.signAsync(payload, { privateKey, algorithm: 'RS256', expiresIn })
```

The refresh use case calls the same `tokenService.sign()` when minting a replacement access token.

### Refresh token (opaque string)

| Property | Value |
|----------|-------|
| Format | 48 random bytes → `base64url` string (not a JWT) |
| TTL | `REFRESH_TOKEN_EXPIRES_DAYS` (default **7 days**) |
| DB storage | **SHA-256 hash only** (`refresh_token_hash` column) — plaintext never persisted |
| Delivery | **`Set-Cookie` header** — never in JSON body |
| Storage (client) | HttpOnly cookie — JavaScript cannot read it |

**Generation path (login):**

```
LoginAccountUseCase.execute()
  → refreshToken = generateRefreshToken()          // crypto.randomBytes
  → refreshTokenHash = hashRefreshToken(token)     // SHA-256 hex
  → accountRepo.update(account with refreshTokenHash)
  → return { accessToken, refreshToken, accountId, role }
```

The **plain** `refreshToken` is returned to `AuthController`, which sets the cookie. The use case comment explicitly states: *"never return in JSON."*

### Token rotation (refresh)

`RefreshAccountUseCase` implements **refresh token rotation**:

1. Hash the incoming cookie value
2. Look up account by `refresh_token_hash`
3. Reject if not found or account not `APPROVED`
4. Generate a **new** opaque refresh token + hash
5. Overwrite `refresh_token_hash` in the database (old token is immediately invalid)
6. Sign a new access JWT
7. Return plain refresh token to controller for cookie update

If a stolen old refresh token is reused after rotation, lookup fails → `401 InvalidRefreshTokenException`.

---

## HttpOnly Cookie Handshake (Step by Step)

This is the server-side execution of the login and refresh cookie contract with the React SPA.

### Prerequisites

1. `cookie-parser` middleware in `main.ts` — parses incoming `Cookie` headers into `req.cookies`
2. CORS allows the frontend origin with `credentials: true` — browser will send/store cookies cross-origin when configured correctly
3. Frontend Axios uses `withCredentials: true` — required for cookie round-trip

### Cookie specification (`auth-cookie.util.ts`)

```ts
REFRESH_TOKEN_COOKIE = 'refresh_token'

buildRefreshTokenCookieOptions(maxAgeMs, isProduction):
  httpOnly: true        // JavaScript cannot access document.cookie for this value
  secure: isProduction  // HTTPS-only in production
  sameSite: 'strict'    // CSRF mitigation — cookie not sent on cross-site navigations
  path: '/api/auth'     // Scoped to auth routes only
  maxAge: maxAgeMs       // Matches REFRESH_TOKEN_EXPIRES_DAYS
```

### Login handshake

```text
Client                          AuthController                    LoginAccountUseCase
  │                                    │                                    │
  │  POST /api/auth/login              │                                    │
  │  Body: { email, password }         │                                    │
  │ ─────────────────────────────────► │                                    │
  │                                    │  execute({ email, password })      │
  │                                    │ ──────────────────────────────────►│
  │                                    │                                    │ verify bcrypt
  │                                    │                                    │ generate refresh + hash
  │                                    │                                    │ sign RS256 access JWT
  │                                    │ ◄──────────────────────────────────│
  │                                    │  { accessToken, refreshToken, ... }│
  │                                    │                                    │
  │                                    │  res.cookie('refresh_token',       │
  │                                    │    result.refreshToken, options)   │
  │                                    │                                    │
  │  200 OK                            │                                    │
  │  Body: { accessToken, accountId, role }   ← access token ONLY in JSON
  │  Set-Cookie: refresh_token=...; HttpOnly; SameSite=Strict; Path=/api/auth
  │ ◄───────────────────────────────── │
```

**Controller code pattern:**

```ts
@Res({ passthrough: true }) res: Response  // allows both cookie + JSON return

res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, buildRefreshTokenCookieOptions(...));

return { accessToken, accountId, role };  // refreshToken deliberately omitted
```

`passthrough: true` is critical: NestJS still serializes the return value as JSON while Express sets the cookie header.

### Refresh handshake

```text
Client                          AuthController                    RefreshAccountUseCase
  │                                    │                                    │
  │  POST /api/auth/refresh            │                                    │
  │  Cookie: refresh_token=<opaque>    │  (no Authorization header needed)  │
  │ ─────────────────────────────────► │                                    │
  │                                    │  plain = req.cookies.refresh_token │
  │                                    │  execute(plain)                    │
  │                                    │ ──────────────────────────────────►│
  │                                    │                                    │ SHA-256 → DB lookup
  │                                    │                                    │ rotate hash + sign JWT
  │                                    │ ◄──────────────────────────────────│
  │                                    │  res.cookie(NEW refresh_token)     │
  │  200 OK                            │                                    │
  │  Body: { accessToken, accountId, role }
  │  Set-Cookie: refresh_token=<rotated>; ...
  │ ◄───────────────────────────────── │
```

If the cookie is missing:

```ts
throw new UnauthorizedException('Refresh token cookie is missing.');
```

If the hash does not match any account:

```ts
throw new InvalidRefreshTokenException();  // → 401 via DomainExceptionFilter
```

---

## HTTP API Summary (Post-Change)

| Method | Path | Throttle | Guards | Response body | Cookie |
|--------|------|----------|--------|---------------|--------|
| `POST` | `/api/auth/register` | 10/hour | `RegisterRoleGuard` | `{ id, email, role, status }` | — |
| `POST` | `/api/auth/login` | 5/min | — | `{ accessToken, accountId, role }` | Sets `refresh_token` |
| `POST` | `/api/auth/refresh` | 10/min | — | `{ accessToken, accountId, role }` | Rotates `refresh_token` |

All paths are prefixed with `/api` via `app.setGlobalPrefix('api')`.

---

## Security Behaviors Worth Knowing

### Login (`LoginAccountUseCase`)

- **Timing-safe unknown email:** If email not found, bcrypt still runs against a `DUMMY_HASH` so response time does not leak account existence.
- **Lockout:** 5 failed attempts → `lockedUntil` set 15 minutes ahead.
- **Status gate:** Only `APPROVED` accounts receive tokens.
- **Failed attempt reset:** Successful login clears `failedLoginAttempts` and `lockedUntil`.

### Registration (`RegisterAccountUseCase` + `RegisterRoleGuard`)

- Public self-registration creates `ATHLETE` accounts in `PENDING` status.
- Creating `ADMIN` or `JUDGE` requires a valid Bearer token from an existing `ADMIN` account.

### Password storage (`BcryptPasswordHasher`)

- Plaintext password → SHA-256 pre-hash → bcrypt (12 rounds by default).
- Pre-hash avoids bcrypt's 72-byte input limit on long passwords.

### JWT verification (`JwtStrategy` + `JwtTokenService`)

- Algorithm restricted to `RS256`.
- Public key loaded from the same key pair as signing.
- `JwtAuthGuard` is wired but not yet applied to business routes — ready for Phase 3 authorization work.

---

## Environment Variables (Auth-Related)

| Variable | Default | Purpose |
|----------|---------|---------|
| `JWT_PRIVATE_KEY_PATH` | — | PEM path for RS256 signing |
| `JWT_PUBLIC_KEY_PATH` | — | PEM path for RS256 verification |
| `JWT_EXPIRES_IN` | `15m` | Access token TTL |
| `REFRESH_TOKEN_EXPIRES_DAYS` | `7` | Refresh cookie `maxAge` |
| `SALT_ROUNDS` | `12` | bcrypt cost factor |
| `FRONTEND_URL` | `http://localhost:5173` | CORS origin for credentialed SPA |
| `NODE_ENV` | — | When `production`, cookie `secure: true` |

Generate dev keys:

```bash
openssl genrsa -out keys/jwt-private.pem 2048
openssl rsa -in keys/jwt-private.pem -pubout -out keys/jwt-public.pem
```

PEM files are gitignored. Docker Compose mounts `./keys:/app/keys:ro` for the API container.

---

## What Is Not Implemented Yet

| Item | Notes |
|------|-------|
| `POST /auth/logout` | No server endpoint to clear the HttpOnly cookie (`Max-Age=0`) |
| Reuse detection / global revocation | Rotated tokens fail lookup, but no explicit "token family" audit trail |
| `JwtAuthGuard` on domain routes | Strategy exists; business controllers not yet protected |
| Argon2 adapter | bcrypt is the active `IPasswordHasher` implementation |

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [`README-IAM.md`](./README-IAM.md) | Full IAM module engineering reference |
| `fdff-front/docs/react-auth-changelog.md` | Frontend changes mirroring this flow |
| `fdff-front/docs/react-auth-docs.md` | Axios interceptor and client API conventions |

---

## Questions?

Before merging auth-related backend changes, verify:

1. Is the refresh token ever returned in a JSON body or logged?
2. Is the raw refresh token ever stored in PostgreSQL (only the hash should be)?
3. Does a new public endpoint need its own `@Throttle()` override?
4. Do DTO rules still match the frontend Zod schemas for register?

If any answer is wrong, stop and review with the team.
