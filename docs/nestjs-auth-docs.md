# NestJS Authentication — Technical Reference

**Repository:** `fdff-backend`  
**Scope:** IAM security infrastructure (JWT, guards, refresh rotation, endpoint protection)  
**Audience:** Developers adding or securing REST API endpoints

For narrative context on what shipped and why, see [`nestjs-auth-changelog.md`](./nestjs-auth-changelog.md). For the full IAM bounded-context reference, see [`README-IAM.md`](./README-IAM.md).

---

## Table of Contents

1. [Security Model Overview](#security-model-overview)
2. [JWT Strategy](#jwt-strategy)
3. [Route Guards](#route-guards)
4. [Refresh Token Rotation](#refresh-token-rotation)
5. [Protecting New Endpoints](#protecting-new-endpoints)
6. [Public vs Authenticated Routes](#public-vs-authenticated-routes)
7. [Error Handling](#error-handling)
8. [Module Wiring](#module-wiring)
9. [Environment & Keys](#environment--keys)
10. [Extension Checklist](#extension-checklist)

---

## Security Model Overview

FDFF uses a **dual-credential** session model:

| Credential | Format | Transport | Validated by |
|------------|--------|-----------|--------------|
| Access token | RS256 JWT (`sub`, `email`) | `Authorization: Bearer` header | `JwtStrategy` + `JwtAuthGuard` |
| Refresh token | Opaque `base64url` string | HttpOnly cookie `refresh_token` | `RefreshAccountUseCase` (no Passport) |

```text
┌─────────────────────────────────────────────────────────────────┐
│                     Protected REST endpoint                      │
│  Authorization: Bearer <access JWT>                              │
│       │                                                          │
│       ▼                                                          │
│  JwtAuthGuard → JwtStrategy.validate() → Account on request.user │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     POST /api/auth/refresh                       │
│  Cookie: refresh_token=<opaque>                                  │
│       │                                                          │
│       ▼                                                          │
│  RefreshAccountUseCase (hash lookup + rotation) — no JwtGuard    │
└─────────────────────────────────────────────────────────────────┘
```

**Design rule:** JWT claims carry **identity only** (`sub`, `email`). `role` and `status` are always loaded from PostgreSQL in `JwtStrategy.validate()` so revoked or suspended users cannot rely on stale token claims.

---

## JWT Strategy

**File:** `src/iam/infrastructure/security/jwt.strategy.ts`  
**Registered in:** `iam.module.ts` providers  
**Passport name:** `'jwt'` (referenced by `JwtAuthGuard`)

### Configuration

```ts
super({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  ignoreExpiration: false,
  secretOrKey: publicKey,       // RS256 public PEM — NOT a shared secret
  algorithms: ['RS256'],
});
```

| Option | Value | Rationale |
|--------|-------|-----------|
| `jwtFromRequest` | `ExtractJwt.fromAuthHeaderAsBearerToken()` | Standard SPA header contract |
| `ignoreExpiration` | `false` | Expired tokens must fail; frontend silent refresh handles renewal |
| `secretOrKey` | RS256 **public** key | Asymmetric verification; private key never used in strategy |
| `algorithms` | `['RS256']` | Prevents algorithm confusion / `none` attacks |

Keys are loaded via `loadJwtKeyPair()` (`jwt-key.util.ts`) from `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH` or inline PEM env vars.

### Payload contract

**File:** `src/iam/infrastructure/security/jwt-payload.interface.ts`

```ts
interface JwtPayload {
  sub: string;   // Account UUID
  email: string;
}
```

Signed by `JwtTokenService.sign()` with `JWT_EXPIRES_IN` (default `15m`). **Do not add `role`, `status`, or permissions to the payload.**

### `validate()` lifecycle

After Passport verifies the JWT signature and expiration, `validate()` runs:

```text
payload.sub present?
  no  → UnauthorizedException('Invalid access token payload.')
  yes → accountRepo.findById(payload.sub)
          missing     → UnauthorizedException('Account not found.')
          not APPROVED → UnauthorizedException('...pending approval or suspended.')
          ok          → return Account (attached to request.user)
```

Returning a domain `Account` from `validate()` is intentional: route handlers and future guards read authoritative `role` and `status` from the database, not from JWT claims.

### Relationship to `JwtTokenService`

| Component | Responsibility |
|-----------|----------------|
| `JwtTokenService` | Signs access tokens (login, refresh); provides `verify()` for non-Passport callers |
| `JwtStrategy` | Passport adapter: extracts Bearer token, verifies RS256, loads `Account` |

`RegisterRoleGuard` uses `tokenService.verify()` directly instead of `JwtAuthGuard` because registration is a special pre-auth flow. New protected routes should prefer `JwtAuthGuard`.

---

## Route Guards

Guards implement `CanActivate` and run **after** global pipes (DTO validation) and **before** the controller handler.

### Available guards

| Guard | File | Status | Purpose |
|-------|------|--------|---------|
| `JwtAuthGuard` | `src/shared/guards/jwt-auth.guard.ts` | Implemented | Requires valid Bearer access JWT |
| `RegisterRoleGuard` | `src/shared/guards/register-role.guard.ts` | In use on `/auth/register` | Restricts privileged role creation |
| `ThrottlerGuard` | `@nestjs/throttler` | Global (`app.module.ts`) | Rate limiting per IP |

`RolesGuard` and `@Roles()` decorator are **not yet implemented** — see [Role-based access (RBAC)](#role-based-access-rbac) for the recommended pattern.

### `JwtAuthGuard`

```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

Thin wrapper around Passport's `AuthGuard('jwt')`, which invokes `JwtStrategy`.

**Apply to a controller or handler:**

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  @Get()
  list() {
    return [];
  }
}
```

**Apply to a single route:**

```ts
@Get('profile')
@UseGuards(JwtAuthGuard)
getProfile() { /* ... */ }
```

**Failure behavior:** Missing, malformed, expired, or cryptographically invalid tokens → `401 Unauthorized` from Passport/`JwtStrategy`. No handler execution.

### `RegisterRoleGuard`

Used exclusively on `POST /auth/register`. Logic:

```text
body.role (default ATHLETE)
  │
  ├─ ATHLETE ──────────────────────► allow (public self-registration)
  │
  └─ ADMIN or JUDGE
        │
        ├─ No Bearer token ────────► ForbiddenRoleAssignmentException (403)
        │
        └─ Verify JWT → load Account from DB
              not APPROVED ADMIN ──► ForbiddenRoleAssignmentException (403)
              ok ──────────────────► allow
```

This guard intentionally verifies via `ITokenServicePort.verify()` + repository lookup rather than `JwtAuthGuard`, because the registration endpoint itself is otherwise public.

### Guard execution order

When multiple guards are declared:

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
```

NestJS runs them **left to right**. Authentication (`JwtAuthGuard`) must precede authorization (`RolesGuard`).

```text
Request
  → ThrottlerGuard (global)
  → ValidationPipe (global)
  → JwtAuthGuard
  → RolesGuard (future)
  → Controller handler
```

### Accessing the authenticated account

After `JwtAuthGuard` succeeds, Passport attaches the return value of `JwtStrategy.validate()` to the request:

```ts
import { Request } from 'express';
import { Account } from '../../iam/domain/account.model';

@Get('me')
@UseGuards(JwtAuthGuard)
me(@Req() req: Request & { user: Account }) {
  const account = req.user;
  return { id: account.id, email: account.email, role: account.role };
}
```

**Recommended follow-up:** Add a typed `@CurrentAccount()` param decorator in `src/shared/decorators/` to avoid repeating `Request & { user: Account }`. Not yet in the codebase.

### Role-based access (RBAC)

RBAC is planned but not shipped. When implementing admin-only or judge-only routes, add:

1. `@Roles(...roles)` metadata decorator
2. `RolesGuard` that reads `request.user.role` (already loaded from DB by `JwtStrategy`)

**Recommended sketch:**

```ts
// src/shared/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { UserRoles } from '../../iam/domain/enums/user-roles.enums';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRoles[]) => SetMetadata(ROLES_KEY, roles);

// src/shared/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRoles[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user: Account }>();
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions.');
    }
    return true;
  }
}
```

**Usage:**

```ts
@Post('approve')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRoles.ADMIN)
approveAccount(@Param('id') id: string) { /* ... */ }
```

Always pair `@Roles()` with `JwtAuthGuard` so `request.user` is populated.

---

## Refresh Token Rotation

**Use case:** `src/iam/application/use-cases/refresh-account.use-case.ts`  
**Endpoint:** `POST /api/auth/refresh` (`AuthController`)  
**Not protected by `JwtAuthGuard`** — authenticates via HttpOnly cookie only.

### Token primitives

**File:** `src/iam/infrastructure/security/refresh-token.util.ts`

```ts
generateRefreshToken()  // 48 random bytes → base64url (opaque, not JWT)
hashRefreshToken(token) // SHA-256 hex digest — only this is stored in DB
```

### Database field

| Column | Type | Content |
|--------|------|---------|
| `accounts.refresh_token_hash` | `VARCHAR(64)` | SHA-256 hex of the **current** valid refresh token |

The plaintext refresh token exists only:

1. Briefly in the use-case return value (controller → `Set-Cookie`)
2. In the browser as an HttpOnly cookie
3. Never in API JSON responses or application logs

### Rotation algorithm

```text
execute(plainRefreshToken from cookie)
  │
  ├─ tokenHash = SHA-256(plainRefreshToken)
  ├─ account = findByRefreshTokenHash(tokenHash)
  │     not found OR status !== APPROVED
  │       → InvalidRefreshTokenException (401)
  │
  ├─ newPlain = generateRefreshToken()
  ├─ newHash = SHA-256(newPlain)
  ├─ accountRepo.update(account with newHash)    ← old hash invalidated immediately
  ├─ accessToken = tokenService.sign({ id, email })
  │
  └─ return { accessToken, refreshToken: newPlain, accountId, role }
```

**Controller post-processing:**

```ts
res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, buildRefreshTokenCookieOptions(...));
return { accessToken, accountId, role };  // new plain refresh NOT in JSON
```

### Rotation properties

| Property | Behavior |
|----------|----------|
| **Single active refresh token per account** | Each login or refresh overwrites `refresh_token_hash` |
| **Automatic invalidation** | Presenting a pre-rotation token fails DB lookup → `401` |
| **Reuse detection (basic)** | Replayed old token after rotation fails; no multi-device token family yet |
| **Status re-check** | Non-`APPROVED` accounts cannot refresh even with a valid hash |
| **Access token re-issued** | Fresh RS256 JWT on every successful refresh |

### Cookie configuration

**File:** `src/iam/infrastructure/security/auth-cookie.util.ts`

| Flag | Value |
|------|-------|
| `httpOnly` | `true` |
| `secure` | `true` when `NODE_ENV === 'production'` |
| `sameSite` | `'strict'` |
| `path` | `'/api/auth'` |
| `maxAge` | `REFRESH_TOKEN_EXPIRES_DAYS` × 24h (default 7 days) |

### Repository method

```ts
// IAccountRepository
findByRefreshTokenHash(hash: string): Promise<Account | null>;
```

Implemented in `TypeOrmAccountRepository` with `WHERE refresh_token_hash = :hash`.

---

## Protecting New Endpoints

### Step 1: Decide the auth requirement

| Route type | Guard setup | Example |
|------------|-------------|---------|
| Public | None (may still hit global throttle) | Health check |
| Authenticated (any logged-in user) | `@UseGuards(JwtAuthGuard)` | User profile |
| Role-restricted | `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)` | Admin approve account |
| Auth handshake | None; custom cookie/body logic | `/auth/login`, `/auth/refresh` |

### Step 2: Create the controller with a DTO

```ts
// src/events/presentation/events.controller.ts
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { Account } from '../../iam/domain/account.model';
import { CreateEventDto } from './dtos/create-event.dto';

@Controller('events')
export class EventsController {
  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() dto: CreateEventDto,
    @Req() req: Request & { user: Account },
  ) {
    const creatorId = req.user.id;
    // delegate to use case...
    return { creatorId, name: dto.name };
  }
}
```

Global `ValidationPipe` validates `CreateEventDto` automatically.

### Step 3: Keep business logic in use cases

Controllers should not verify passwords, parse JWTs, or query TypeORM directly. Use cases receive `accountId` or `Account` as a command field:

```ts
// application/use-cases/create-event.use-case.ts
async execute(command: { accountId: string; name: string }) {
  // domain rules here
}
```

### Step 4: Register the module

Import `IamModule` or export shared guards from a `SharedModule` if you centralize guard providers. `JwtStrategy` must remain registered in `IamModule` providers for Passport.

`JwtAuthGuard` has no module registration requirement when used via `@UseGuards(JwtAuthGuard)` on controllers in modules that import `PassportModule` — today `PassportModule` is registered in `IamModule`. **When adding guards to new feature modules**, either:

- Import `IamModule` (if it exports `JwtModule` / `PassportModule`), or
- Create a `SharedAuthModule` that exports `JwtAuthGuard` and re-exports `PassportModule`

Current `IamModule` exports only use cases, not guards. Feature modules in the same app can reference `JwtAuthGuard` directly from `src/shared/guards/` because `JwtStrategy` is registered at app bootstrap via `IamModule`.

### Step 5: Add throttling if the route is abuse-prone

```ts
import { Throttle } from '@nestjs/throttler';

@Post('register')
@Throttle({ default: { limit: 10, ttl: 3600000 } })
```

Global default: **100 req/min** per IP. Override on sensitive public or expensive endpoints.

### Step 6: Test with curl

```bash
# Login — capture access token and cookie
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@fdff.com","password":"Fdff$test123"}'

# Protected route
curl -s -X GET http://localhost:3000/api/events \
  -H "Authorization: Bearer <accessToken>"

# Refresh — cookie only
curl -s -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/auth/refresh
```

---

## Public vs Authenticated Routes

### Current auth endpoints (no `JwtAuthGuard`)

| Method | Path | Auth mechanism |
|--------|------|----------------|
| `POST` | `/api/auth/register` | Public for `ATHLETE`; `RegisterRoleGuard` for privileged roles |
| `POST` | `/api/auth/login` | Credentials in body |
| `POST` | `/api/auth/refresh` | `refresh_token` HttpOnly cookie |

### Recommended global JWT pattern (future)

Apply `JwtAuthGuard` globally and opt out with a `@Public()` decorator on handshake routes:

```ts
// Future pattern — not yet implemented
app.useGlobalGuards(new JwtAuthGuard());

@Public()
@Post('login')
login() { /* ... */ }
```

Until that is implemented, **explicitly add `@UseGuards(JwtAuthGuard)`** to each protected controller or route.

---

## Error Handling

### Passport / JWT guard errors

| Condition | HTTP | Source |
|-----------|------|--------|
| Missing `Authorization` header | 401 | Passport |
| Invalid / expired JWT | 401 | `JwtStrategy` / `JwtTokenService` |
| Account deleted or not `APPROVED` | 401 | `JwtStrategy.validate()` |

### Domain exceptions (`DomainExceptionFilter`)

| Exception | HTTP | When |
|-----------|------|------|
| `InvalidCredentialsException` | 401 | Wrong email/password |
| `InvalidRefreshTokenException` | 401 | Bad or rotated refresh token |
| `AccountNotApprovedException` | 401 | Login before approval |
| `AccountLockedException` | 423 | Too many failed logins |
| `ForbiddenRoleAssignmentException` | 403 | Non-admin creating admin/judge |
| `AccountAlreadyExistsException` | 400 | Duplicate registration |

NestJS `UnauthorizedException` from `AuthController` (missing cookie) returns standard Nest 401 JSON.

---

## Module Wiring

```text
AppModule
  ├── ThrottlerModule + ThrottlerGuard (global)
  ├── ConfigModule (global)
  └── IamModule
        ├── PassportModule.register({ defaultStrategy: 'jwt' })
        ├── JwtModule.registerAsync({ algorithm: 'RS256', keys from PEM })
        ├── providers: [ JwtStrategy, JwtTokenService, use cases, repositories ]
        └── controllers: [ AuthController ]
```

**Key files:**

| Concern | Path |
|---------|------|
| Strategy | `src/iam/infrastructure/security/jwt.strategy.ts` |
| Sign / verify port | `src/iam/infrastructure/security/jwt-token.service.ts` |
| Auth guard | `src/shared/guards/jwt-auth.guard.ts` |
| Register guard | `src/shared/guards/register-role.guard.ts` |
| Refresh rotation | `src/iam/application/use-cases/refresh-account.use-case.ts` |
| Cookie builder | `src/iam/infrastructure/security/auth-cookie.util.ts` |
| Exception mapping | `src/shared/filters/domain-exception.filter.ts` |

---

## Environment & Keys

| Variable | Default | Used by |
|----------|---------|---------|
| `JWT_PRIVATE_KEY_PATH` | — | `JwtTokenService.sign()` |
| `JWT_PUBLIC_KEY_PATH` | — | `JwtStrategy`, `JwtTokenService.verify()` |
| `JWT_EXPIRES_IN` | `15m` | Access token TTL |
| `REFRESH_TOKEN_EXPIRES_DAYS` | `7` | Cookie `maxAge` |
| `FRONTEND_URL` | `http://localhost:5173` | CORS origin (`credentials: true`) |
| `NODE_ENV` | — | Cookie `secure` flag |

Generate development keys:

```bash
openssl genrsa -out keys/jwt-private.pem 2048
openssl rsa -in keys/jwt-private.pem -pubout -out keys/jwt-public.pem
```

---

## Extension Checklist

When adding a new **protected** endpoint:

- [ ] Create a DTO with `class-validator` decorators
- [ ] Add `@UseGuards(JwtAuthGuard)` (and `RolesGuard` + `@Roles()` if role-restricted)
- [ ] Read identity from `request.user` (`Account`), not from JWT body parsing
- [ ] Pass `accountId` / `Account` into a use case — no auth logic in the controller
- [ ] Throw `DomainException` subclasses for business rule violations
- [ ] Add `@Throttle()` if the route is public or expensive
- [ ] Do **not** return `passwordHash`, `refreshTokenHash`, or raw refresh tokens in responses
- [ ] Verify manually with `curl` (Bearer header + cookie jar for refresh flows)

When adding a new **auth** endpoint:

- [ ] Decide: Bearer, cookie, or credential body?
- [ ] Cookie routes need `cookie-parser` (already in `main.ts`) and CORS `credentials: true`
- [ ] Never return refresh tokens in JSON
- [ ] Store only `hashRefreshToken(plain)` in PostgreSQL

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [`nestjs-auth-changelog.md`](./nestjs-auth-changelog.md) | Team changelog: what changed and why |
| [`README-IAM.md`](./README-IAM.md) | IAM bounded context, ports, use cases, roadmap |
| `fdff-front/docs/react-auth-docs.md` | SPA Axios interceptor and client conventions |

---

## Quick Reference

```ts
// Protect a route
@UseGuards(JwtAuthGuard)
@Get()
handler(@Req() req: Request & { user: Account }) {
  const { id, role, status } = req.user;
}

// Privileged registration (existing)
@UseGuards(RegisterRoleGuard)
@Post('register')
register(@Body() dto: RegisterAccountDto) { /* ... */ }

// Refresh (cookie auth — no JwtAuthGuard)
@Post('refresh')
refresh(@Req() req: Request) {
  const token = req.cookies?.['refresh_token'];
}
```
