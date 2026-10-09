# IAM Module — Engineering Reference

> **Bounded context:** Identity & Access Management.
> **Ubiquitous term:** `Account` (not "User") — a system identity with credentials and an RBAC role.
> **Scope:** this is the single reference for the IAM slice. It replaces the former `nestjs-auth-docs.md` and `ai-auth-context.md`, which described the same module twice more and drifted.
> **Last verified against the code:** 2026-10-05.

---

## 1. What this module owns

Who can reach the API, and how credentials are issued and validated.

- Public athlete self-signup, and admin provisioning of judge/admin accounts.
- Credential login issuing a short-lived access token plus a rotating refresh token.
- Account lifecycle (`PENDING → ACTIVE → INACTIVE`) and admin account management.
- Brute-force mitigation: per-route throttling, account lockout, timing-safe login.
- Separation of **system identity** (`Account`) from **physical competitor data** (`CompetitorProfile`, not built).

It is the first vertical slice and underpins every future one.

## 2. HTTP API

All routes are under the global `/api` prefix.

### `AuthController` — `/api/auth`

| Method | Path | Guards | Throttle | Success |
| --- | --- | --- | --- | --- |
| `POST` | `/auth/register` | none (public) | 10 / hour | `201` |
| `POST` | `/auth/login` | none | 5 / min | `200` |
| `POST` | `/auth/logout` | none (cookie only) | 5 / min | `200` |
| `POST` | `/auth/refresh` | none (cookie only) | 10 / min | `200` |

### `AccountController` — `/api/accounts`

Guards are applied **at class level** (`JwtAuthGuard`, `RolesGuard`, `@Roles(ADMIN)`), so a new method cannot be added unguarded.

| Method | Path | Success | Notes |
| --- | --- | --- | --- |
| `GET` | `/accounts` | `200` | Paginated `{ data, total, page, limit }`; filters `email` (fragment), `role`, `status`, `page`, `limit`, `sortOrder` |
| `POST` | `/accounts` | `201` | Explicit role, created `ACTIVE` |
| `POST` | `/accounts/activate/:accountId` | `204` | `PENDING` or `INACTIVE` → `ACTIVE` |
| `POST` | `/accounts/deactivate/:accountId` | `204` | Also clears the refresh token |

`:accountId` goes through `ParseUUIDPipe`, so a malformed id is a `400` rather than a Postgres error surfacing as `500`.

A global `ThrottlerGuard` adds an app-wide 100 req/min (`app.module.ts`).

### Two ways to create an account — on purpose

| | `POST /auth/register` | `POST /accounts` |
| --- | --- | --- |
| Who | anyone, unauthenticated | `ADMIN` only |
| Role | **no role parameter exists** — always `ATHLETE` | explicit, any role |
| Status | `PENDING` (admin must activate) | `ACTIVE` immediately |

`RegisterAccountUseCase` has no `role` field in its command type, so public signup **cannot** produce a privileged account regardless of what a controller, DTO or guard above it gets wrong. That is a structural guarantee, not a check. The DTO additionally restricts `role` to `ATHLETE` — the field only still exists because the SPA sends `role: "ATHLETE"` and the `ValidationPipe` runs with `forbidNonWhitelisted`, so removing it would reject every signup.

## 3. Token model

| Token | Lifetime | Transport | Storage |
| --- | --- | --- | --- |
| Access | `JWT_EXPIRES_IN` (default `15m`) | JSON response body | in-memory on the client only |
| Refresh | `REFRESH_TOKEN_EXPIRES_DAYS` (default 7) | `HttpOnly` cookie | SHA-256 hash in `accounts.refresh_token_hash` |

- Access tokens are **RS256**, signed with the private key; the payload is identity-only — `{ sub, email }`. **Role is deliberately not a claim.** `RolesGuard` reads the freshly-loaded `Account`, so a demoted or deactivated admin loses access on the next request instead of at token expiry. Do not "optimise" that database read away.
- The refresh token is an opaque 64-char random string. Only its hash is stored, so a database leak does not yield usable tokens.
- Cookie options: `httpOnly`, `sameSite: 'strict'`, `secure` in production, `path: '/api/auth'`. Set and clear must use matching options or the cookie will not clear.
- **Rotation:** every successful `/auth/refresh` issues a new refresh token and overwrites the stored hash, so the previous one stops working immediately.

## 4. Domain model

`Account` is a rich entity: it enforces its own invariants and returns new instances rather than mutating.

| Field | Notes |
| --- | --- |
| `id` | UUID, generated in application code (`randomUUID`) |
| `email` | unique login identifier, lowercased and trimmed at the DTO |
| `passwordHash` | bcrypt, `SALT_ROUNDS` (default 10) |
| `role` | `ADMIN` \| `JUDGE` \| `ATHLETE` |
| `status` | `PENDING` \| `ACTIVE` \| `INACTIVE` |
| `failedLoginAttempts` | lockout counter |
| `lockedUntil` | nullable |
| `refreshTokenHash` | nullable until first login; nulled on logout and deactivation |

**Behaviour:** `isActive()`, `isLocked(now)`, `registerFailedLogin(policy, now)`, `clearLoginAttempts()`, `activate()`, `deactivate()`, `withRefreshToken(hash)`, `clearRefreshToken()`. All route through one private `copyWith()`, which is the only place an `Account` is rebuilt.

- `now` is always a **parameter**, never `new Date()` inside the entity, so lockout is testable without faking time.
- Lockout thresholds arrive as a `LockoutPolicy` argument (`DEFAULT_LOCKOUT_POLICY`: 5 attempts, 15 minutes). They are an operations lever, not an invariant, and the entity must never read configuration.

### Status transitions

| From → To | Result |
| --- | --- |
| `PENDING` → `ACTIVE` | allowed (approve a registration) |
| `INACTIVE` → `ACTIVE` | allowed (reinstate — the admin page is a toggle) |
| `ACTIVE` → `ACTIVE` | `AccountAlreadyActiveException` → `409` |
| `ACTIVE` / `PENDING` → `INACTIVE` | allowed; also clears `refreshTokenHash` |
| `INACTIVE` → `INACTIVE` | `AccountAlreadyInactiveException` → `409` |

Deactivating a `PENDING` account is how a registration is rejected — the enum has no `REJECTED` value.

## 5. Ports & adapters

| Port | Token | Implementation |
| --- | --- | --- |
| `IAccountRepository` | `'I_ACCOUNT_REPOSITORY'` | `TypeOrmAccountRepository` |
| `IPasswordHasherPort` | `Symbol('I_PASSWORD_HASHER')` | `BcryptPasswordHasher` |
| `ITokenServicePort` | `Symbol('I_TOKEN_SERVICE')` | `JwtTokenService` |
| `AuthPolicy` | `Symbol('I_AUTH_POLICY')` | factory in `iam.module.ts` |

Repository methods: `findById`, `findByEmail`, `findByRefreshTokenHash`, `save`, `update`, `findMany(query) → { rows, total }`.

- `ITokenServicePort` exposes **`sign` only**. Tokens are verified by `JwtStrategy` through passport, so the port has no `verify`.
- `AuthPolicy` resolves every tunable auth value once — refresh TTL and the lockout policy. Before it existed, `REFRESH_TOKEN_EXPIRES_DAYS` was parsed independently in two use cases with separate defaults.
- `findMany` takes `AccountsQuery` from `application/ports/`, **not** the presentation DTO, so the port does not depend on the HTTP layer.

## 6. Use cases

| Use case | Enforces |
| --- | --- |
| `RegisterAccountUseCase` | duplicate email → `409`-free `400`; always `ATHLETE` + `PENDING` |
| `CreateAccountUseCase` | admin-provisioned; explicit role, `ACTIVE` |
| `LoginAccountUseCase` | lockout, timing-safe compare, active-only, rotation |
| `RefreshAccountUseCase` | hash lookup, active-only, rotation, opaque failure |
| `LogoutAccountUseCase` | nulls the stored hash; tolerates a missing/unknown token |
| `ActivateAccountUseCase` / `DeactivateAccountUseCase` | existence → `404`, then the domain transition |
| `GetAccountsUseCase` | always paginated |

### Login flow, and why its order matters

```
findByEmail
  ↓
isLocked(now)?            → AccountLockedException (423)
  ↓                         [see the trade-off below]
bcrypt compare             (against DUMMY_HASH when the email is unknown,
  ↓                          so response time doesn't reveal existence)
invalid?                  → registerFailedLogin → update → InvalidCredentials (401)
  ↓
isActive()?               → clearLoginAttempts → update → AccountNotActivated (401)
  ↓
generate refresh token → clearLoginAttempts().withRefreshToken(hash) → update
  ↓
sign RS256 access token
  ↓
Set-Cookie: refresh_token  +  JSON { accessToken, accountId, role }
```

**Known trade-off:** the lockout check runs *before* bcrypt, so a locked account short-circuits without paying the hash cost. That is a timing signal which partly undercuts the `DUMMY_HASH` enumeration defence directly below it. It is deliberate and commented in the code — change it knowingly, not as a refactor side effect.

The refresh path deliberately returns **one opaque error** for every failure (no such token, or account not active). Unlike login, it must not let a stolen cookie distinguish those cases.

## 7. Exceptions → HTTP

All extend `DomainException` (in `src/shared/domain/`) and are mapped by `DomainExceptionFilter`.

| Exception | HTTP |
| --- | --- |
| `InvalidCredentialsException` | 401 |
| `InvalidRefreshTokenException` | 401 |
| `AccountNotActivatedException` | 401 |
| `ForbiddenRoleException` | 403 |
| `AccountNotFoundException` | 404 |
| `AccountAlreadyExistsException` | 400 |
| `AccountAlreadyActiveException` | 409 |
| `AccountAlreadyInactiveException` | 409 |
| `AccountLockedException` | 423 |

There must be **exactly one** `DomainException` class: `@Catch(DomainException)` matches on class identity, so a second copy makes the filter silently stop matching and every domain error becomes a `500` with a leaked stack. `domain-exception.filter.spec.ts` asserts all of the above are `instanceof` the shared base class.

## 8. Protecting a new endpoint

1. **Decide the requirement.** Public, authenticated, or role-restricted.
2. **Guard it at class level** so new methods inherit it:
   ```ts
   @Controller('athletes')
   @UseGuards(JwtAuthGuard, RolesGuard)
   @Roles(UserRoles.ADMIN, UserRoles.JUDGE)
   export class AthletesController { ... }
   ```
3. **Import `IamModule`** in your feature module. `JwtAuthGuard` resolves the `'jwt'` strategy registered there; without the import, DI fails.
4. **Read the actor from `request.user`** — `JwtStrategy.validate()` attaches the freshly-loaded domain `Account`, not the raw JWT payload.
5. **Validate input with a DTO.** The global pipe runs `whitelist`, `forbidNonWhitelisted`, `transform`. Query params need `@Type(() => Number)` to coerce.
6. **Keep logic in a use case**; the controller only maps HTTP to a command and projects the result.
7. **Throttle** abuse-prone routes with `@Throttle({ default: { limit, ttl } })`.
8. **Never return an ORM entity.** Project to a plain object — that is what keeps `passwordHash` out of responses.

**Guards run before the `ValidationPipe`**, so a guard sees the raw unvalidated body. Do not branch on `request.body` in a guard; that mistake is why `RegisterRoleGuard` was deleted.

## 9. Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | **required**, no defaults | Postgres connection |
| `DB_PORT` | `5432` | Postgres port |
| `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH` | — | RS256 PEM paths; `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` accept inline PEM instead |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRES_DAYS` | `7` | Refresh cookie max-age |
| `SALT_ROUNDS` | `10` | bcrypt cost |
| `NODE_ENV` | **required** | `development`, `production` or `test`; `production` enables `secure` cookies |
| `FRONTEND_URL` | `http://localhost:5173` | CORS origin (single value, not an allowlist) |
| `PORT` | `3000` | HTTP port |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | `npm run db:seed` only |

Startup validation (`src/shared/config/validate-env.ts`) refuses to boot, and the TypeORM CLI refuses to run, if a required variable is missing or if `DB_PORT`, `SALT_ROUNDS` or `REFRESH_TOKEN_EXPIRES_DAYS` is set but not a positive integer. The error names variables, never values.

Password policy: 8–20 characters, `@IsPasswordStrong` (see `shared/validators/`), aligned with the React signup schema. The 20-character cap blocks passphrases and is worth revisiting.

## 10. Must not break

1. **Refresh tokens are stored hashed.** Never persist or log the plain token.
2. **No role in the JWT.** Status and role are re-read from the database per request.
3. **`passwordHash` never leaves the API.** Controllers project explicitly.
4. **Cookie set/clear options must match**, including `path`.
5. **Rotation on every refresh.** Reusing a hash defeats the design.
6. **Domain stays framework-free**, and `shared/` stays slice-free.
7. **`synchronize` stays `false`.** Schema changes are migrations, reviewed before running.

## 11. Not implemented — do not assume it exists

- No OpenAPI/Swagger spec; frontend API types are hand-written.
- No `jti`/denylist, so a stolen access token is valid until `exp`.
- No token-family revocation when a rotated refresh token is replayed.
- No refresh concurrency control — two tabs refreshing at once can race.
- No email verification, password reset, or password change.
- No audit log of account changes.
- No "cannot deactivate the last admin" or "cannot deactivate yourself" rule. Those need the acting user or a repository count, so they belong in the use case, not the entity.
- No CI, no Supabase, no Traefik.
- Open findings live in `DevSecOps_SecurityAudit.md`; some entries predate the current code.

## 12. Next slices, in dependency order

1. **Athletes** (`CompetitorProfile`) — the registration form already collects profile fields the API ignores. Needs the cédula decisions in `architecture/backend-implications.md`.
2. **Categories** (`CategoryDefinition`) — eligibility rules; blocked on the age question (competition date vs. birth year).
3. **Competitions** + `CompetitionCategory` ordering.
4. **Registrations** (`EventRegistration`) — one row per athlete × category, with bulk approval.
5. **Results** (`Score`) — blocked on confirming the scoring method with the federation.

## 13. File map

```
src/iam/
├── domain/
│   ├── account.model.ts              # rich entity + LockoutPolicy
│   ├── enums/{account-status,user-roles}
│   └── exceptions/                   # 9 DomainException subclasses
├── application/
│   ├── ports/{account.repository.interface,accounts-query,
│   │           password-hasher.port,token.service.port,auth-policy}
│   └── use-cases/                    # 8 use cases
├── infrastructure/
│   ├── persistence/{account.orm-entity,typeorm-account.repository}
│   └── security/{jwt.strategy,jwt-token.service,jwt-key.util,
│                 bcrypt-password-hasher,refresh-token.util,auth-cookie.util}
├── presentation/
│   ├── {auth,account}.controller.ts
│   ├── dtos/{register-account,create-account,login,accounts-list-request}
│   └── guards/{jwt-auth.guard,roles.guard}
├── testing/{account.fixture,fake-account.repository}
└── iam.module.ts
```

Shared: `src/shared/domain/domain.exception.ts`, `src/shared/filters/domain-exception.filter.ts`, `src/shared/validators/password-strength.validator.ts`, `src/shared/database/`. Composition roots: `src/configure-app.ts`, `src/scripts/seed-admin.ts`.
