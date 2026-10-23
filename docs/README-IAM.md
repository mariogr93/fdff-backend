# IAM Module — Engineering Reference

> **Bounded context:** Identity & Access Management.
> **Ubiquitous term:** `Account` (not "User") — a system identity with credentials and an RBAC role.
> **Scope:** this is the single reference for the IAM slice. It replaces the former `nestjs-auth-docs.md` and `ai-auth-context.md`, which described the same module twice more and drifted.
> **Last verified against the code:** 2026-10-15 (NestJS 12, Node 24). Frontend developers: start with section 14, the client contract.

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

**OpenAPI.** Outside production, `main.ts` serves the Swagger UI at `/api/docs` and the raw spec at `/api/docs-json` (`shared/http/setup-openapi.ts`). In production both are `404`: the spec maps every route. The `@nestjs/swagger` build plugin (`nest-cli.json`) reads the `class-validator` decorators of every `*.dto.ts`, so request and response schemas come from the DTOs; controllers declare `*.dto.ts` response classes as their return types for that reason. The frontend can generate its types from the spec, for example `npx openapi-typescript http://localhost:3000/api/docs-json -o src/types/api.ts`. `openapi.spec.ts` checks that every route and its security scheme are in the document.

### `AuthController` — `/api/auth`

| Method | Path | Guards | Throttle | Success |
| --- | --- | --- | --- | --- |
| `POST` | `/auth/register` | none (public) | 10 / hour | `201` |
| `POST` | `/auth/login` | none | 5 / min | `200` |
| `POST` | `/auth/logout` | none (cookie only) | 5 / min | `200` |
| `POST` | `/auth/refresh` | none (cookie only) | 10 / min | `200` |
| `POST` | `/auth/change-password` | bearer token, any role | 2 / 10 min | `204` |

`change-password` is the only route in this controller that needs a bearer token, so its `JwtAuthGuard`, `RolesGuard` and `@Roles` sit on the method, not the class (the rest of the controller is public). Body `{ currentPassword, newPassword }`. It ends every session of the account, this one included, and clears the refresh cookie: the client signs in again with the new password. All three password flows end in `Account.changePassword()`.

**Cross-site requests.** `SameOriginGuard` sits on the whole `AuthController`, because `SameSite=Strict` only protects routes that need the cookie, and login, logout and register need none (login CSRF would sign the victim in as the attacker). A request whose `Origin` is not in `FRONTEND_URL` gets `403` (`CrossOriginRequestException`) before any use case runs. Browsers send `Origin` on every POST. With no `Origin`, a request passes unless the browser marked it `Sec-Fetch-Site: cross-site`; curl and servers send neither header and pass.

**JSON only.** `requireJsonBody` (registered in `configureApp`, before Nest's body parsers) answers `415` to any request that has a body that is not `application/json`, so a hostile HTML form cannot post to any route. Empty bodies pass: browsers send `Content-Length: 0` and no `Content-Type` on logout and refresh.

### `AccountController` — `/api/accounts`

Guards are applied **at class level** (`JwtAuthGuard`, `RolesGuard`, `@Roles(ADMIN)`), so a new method cannot be added unguarded.

| Method | Path | Success | Notes |
| --- | --- | --- | --- |
| `GET` | `/accounts` | `200` | Paginated `{ data, total, page, limit }`; filters `email` (fragment), `role`, `status`, `page`, `limit`, `sortOrder` |
| `POST` | `/accounts` | `201` | Explicit role, created `ACTIVE` |
| `POST` | `/accounts/activate/:accountId` | `204` | `PENDING` or `INACTIVE` → `ACTIVE` |
| `POST` | `/accounts/deactivate/:accountId` | `204` | Ends the session and revokes its access tokens at once. `409` for your own account, the last active admin, or an already inactive one |

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
| Refresh | `REFRESH_TOKEN_EXPIRES_DAYS` (default 1) | `HttpOnly` cookie | SHA-256 hash in `accounts.refresh_token_hash`, expiry in `accounts.refresh_token_expires_at`, replaced token in `accounts.previous_refresh_token_hash` |

- Access tokens are **RS256**, signed with the private key; the payload is `{ sub, email, tv }`: identity plus `tv`, the account's `tokenVersion` when the token was issued. **Role is deliberately not a claim.** `RolesGuard` reads the freshly-loaded `Account`, so a demoted or deactivated admin loses access on the next request instead of at token expiry. Do not "optimise" that database read away.
- **Revoking access tokens without a denylist.** `JwtStrategy` rejects a token whose `tv` differs from the account's current `tokenVersion` (`401`). Logout, deactivation and refresh-reuse detection raise the version, so every access token issued so far stops working at once instead of at expiry. Login and refresh do not raise it: they sign with the current value. Because the version belongs to the account, a logout on one device ends the access tokens of its other sessions too. A token with no `tv` (issued before the column existed) is rejected.
- The refresh token is an opaque 64-char random string. Only its hash is stored, so a database leak does not yield usable tokens.
- Cookie options: `httpOnly`, `sameSite: 'strict'`, `path: '/api/auth'`, and `secure` in every environment except `NODE_ENV=development` (so a production or test build needs HTTPS for the cookie to be sent). Set and clear must use matching options or the cookie will not clear.
- **Rotation:** every successful `/auth/refresh` issues a new refresh token and overwrites the stored hash, so the previous one stops working immediately.

## 4. Domain model

`Account` is a rich entity: it enforces its own invariants and returns new instances rather than mutating.

| Field | Notes |
| --- | --- |
| `id` | UUID, generated in application code (`randomUUID`) |
| `email` | unique login identifier, case-insensitive: stored trimmed and lowercase by `normalizeEmail()` (`domain/normalize-email.ts`), which login, register, create and the seed all call. DTOs only validate the format |
| `passwordHash` | bcrypt, `SALT_ROUNDS` (default 12) |
| `role` | `ADMIN` \| `JUDGE` \| `ATHLETE` |
| `status` | `PENDING` \| `ACTIVE` \| `INACTIVE` |
| `failedLoginAttempts` | lockout counter |
| `lockedUntil` | nullable |
| `refreshTokenHash` | nullable until first login; nulled on logout and deactivation |
| `previousRefreshTokenHash` | the token the latest rotation replaced; nulled with the current one, and at login. Used only to detect reuse |
| `refreshTokenExpiresAt` | when the stored refresh token stops being valid; nulled together with the hash. A hash with no expiry counts as expired |
| `tokenVersion` | starts at 0, goes into every access token as `tv`. Raised by `deactivate()`, `clearRefreshToken()` and `revokeAccessTokens()`; never lowered |

**Behaviour:** `isActive()`, `isLocked(now)`, `registerFailedLogin(policy, now)`, `clearLoginAttempts()`, `activate()`, `deactivate()`, `withRefreshToken(hash, expiresAt)` (new session), `rotateRefreshToken(hash, expiresAt)` (refresh), `clearRefreshToken()`, `revokeAccessTokens()`, `hasLiveRefreshToken(now)`. All route through one private `copyWith()`, which is the only place an `Account` is rebuilt.

- `now` is always a **parameter**, never `new Date()` inside the entity, so lockout is testable without faking time.
- Lockout thresholds arrive as a `LockoutPolicy` argument (`DEFAULT_LOCKOUT_POLICY`: 5 attempts, 15 minutes). They are an operations lever, not an invariant, and the entity must never read configuration.
- An **expired lock resets the counter**: the first wrong password after `lockedUntil` passes counts as attempt 1, not as attempt N+1. A correct password also clears both fields via `clearLoginAttempts()`.

### Status transitions

| From → To | Result |
| --- | --- |
| `PENDING` → `ACTIVE` | allowed (approve a registration) |
| `INACTIVE` → `ACTIVE` | allowed (reinstate — the admin page is a toggle) |
| `ACTIVE` → `ACTIVE` | `AccountAlreadyActiveException` → `409` |
| `ACTIVE` / `PENDING` → `INACTIVE` | allowed; also clears the refresh token fields and raises `tokenVersion`, so existing access tokens stop working. Refused for the last active `ADMIN` and for your own account (`409`, checked in the use case) |
| `INACTIVE` → `INACTIVE` | `AccountAlreadyInactiveException` → `409` |

Deactivating a `PENDING` account is how a registration is rejected — the enum has no `REJECTED` value.

## 5. Ports & adapters

| Port | Token | Implementation |
| --- | --- | --- |
| `IAccountRepository` | `'I_ACCOUNT_REPOSITORY'` | `TypeOrmAccountRepository` |
| `IPasswordHasherPort` | `Symbol('I_PASSWORD_HASHER')` | `BcryptPasswordHasher` |
| `ITokenServicePort` | `Symbol('I_TOKEN_SERVICE')` | `JwtTokenService` |
| `IRefreshTokenServicePort` | `Symbol('I_REFRESH_TOKEN_SERVICE')` | `RefreshTokenService` |
| `AuthPolicy` | `Symbol('I_AUTH_POLICY')` | factory in `iam.module.ts` |

Repository methods: `findById`, `findByEmail`, `findByRefreshTokenHash`, `findByPreviousRefreshTokenHash`, `save`, `update`, `updateIfRefreshTokenHashIs(account, expectedHash) → boolean`, `findMany(query) → { rows, total }`, `countByRoleAndStatus(role, status) → number`.

- `save` is a strict **insert** for new accounts. Postgres unique violation (`23505`) becomes `AccountAlreadyExistsException` (400), so two simultaneous signups with one email give one 201 and a clean 400, never a 500.
- `updateIfRefreshTokenHashIs` is optimistic locking: one conditional `UPDATE` that writes only if the stored refresh hash is still the expected one. It encodes no business rule; the domain still decides the new state.

- `ITokenServicePort` exposes **`sign` only**. Tokens are verified by `JwtStrategy` through passport, so the port has no `verify`.
- `AuthPolicy` resolves every tunable auth value once — refresh TTL and the lockout policy. Before it existed, `REFRESH_TOKEN_EXPIRES_DAYS` was parsed independently in two use cases with separate defaults.
- `findMany` takes `AccountsQuery` from `application/ports/`, **not** the presentation DTO, so the port does not depend on the HTTP layer.

## 6. Use cases

| Use case | Enforces |
| --- | --- |
| `RegisterAccountUseCase` | duplicate email → `409`-free `400`; always `ATHLETE` + `PENDING` |
| `CreateAccountUseCase` | admin-provisioned; explicit role, `ACTIVE` |
| `LoginAccountUseCase` | lockout, timing-safe compare, active-only, rotation |
| `RefreshAccountUseCase` | hash lookup, active-only, server-side expiry, single-use rotation (guarded write), opaque failure |
| `LogoutAccountUseCase` | clears the stored refresh token and raises `tokenVersion`, so the access tokens die too; tolerates a missing/unknown token |
| `ActivateAccountUseCase` / `DeactivateAccountUseCase` | existence → `404`, then the domain transition. Deactivate first refuses `actorId === accountId` (`409`), and refuses to deactivate the last active `ADMIN` (`409`, `LastAdminException`; counted through `countByRoleAndStatus`, not atomic with the write) |
| `ChangePasswordUseCase` | wrong current password → `400`; new equal to current → `400`. Hashes the new one and calls `Account.changePassword()` (ends all sessions, raises `tokenVersion`). Opens no session |
| `GetAccountsUseCase` | always paginated |

### Login flow, and why its order matters

```
findByEmail
  ↓
bcrypt compare             (always exactly one; against a dummy hash built by the
  ↓                          same hasher when the email is unknown, so response
  ↓                          time doesn't reveal existence or lock state)
account locked?            → right password: AccountLockedException (423)
  ↓                          wrong password: InvalidCredentials (401), counter untouched
no account / invalid?      → registerFailedLogin → update → InvalidCredentials (401)
  ↓
isActive()?               → clearLoginAttempts → update → AccountNotActivated (401)
  ↓
generate refresh token → clearLoginAttempts().withRefreshToken(hash, now + ttl) → update
  ↓
sign RS256 access token
  ↓
Set-Cookie: refresh_token  +  JSON { accessToken, accountId, role }
```

**Timing and disclosure:** every path pays one bcrypt comparison (measured at cost 12: unknown email, wrong password, locked account all about 210 ms). Only someone who proves they know the password is told the account is locked (423) or not yet activated; everyone else sees the same generic 401. A guess at a locked account is not counted, so strangers cannot extend a lock. The dummy hash is built lazily with the real hasher, so its cost follows `SALT_ROUNDS`; the first unknown-email login after boot pays one extra hash.

The refresh path deliberately returns **one opaque error** for every failure (no such token, expired token, account not active, or a lost race). Unlike login, it must not let a stolen cookie distinguish those cases.

A refresh token is **single-use** and **expires on the server**. `findByRefreshTokenHash` finds the account, `hasLiveRefreshToken(now)` enforces `refresh_token_expires_at`, and the rotation is written with `updateIfRefreshTokenHashIs(rotated, oldHash)`, so of two simultaneous refreshes with one cookie exactly one succeeds. A stored hash with no expiry (a session from before the column existed) counts as expired.

**Reuse detection:** each rotation remembers the token it replaced. If that old token is presented again, no account holds it as current, but one holds it as previous, so the session is ended (`clearRefreshToken()`), a warning with the **account id only** is logged, and the caller still gets the same opaque 401. The holder of the newest token is signed out too and must log in again. Limits: only the immediately previous token is recognised; a lost response followed by a retry looks like reuse; an expired current token or a lost rotation race is *not* treated as theft; login starts a fresh session and forgets the previous token, so a second device's login does not trip it.

## 7. Exceptions → HTTP

All extend `DomainException` (in `src/shared/domain/`) and are mapped by `DomainExceptionFilter`.

| Exception | HTTP |
| --- | --- |
| `InvalidCredentialsException` | 401 |
| `InvalidRefreshTokenException` | 401 |
| `AccountNotActivatedException` | 401 |
| `ForbiddenRoleException` | 403 |
| `CrossOriginRequestException` | 403 (`SameOriginGuard`, auth routes) |
| `AccountNotFoundException` | 404 |
| `AccountAlreadyExistsException` | 400 |
| `AccountAlreadyActiveException` | 409 |
| `AccountAlreadyInactiveException` | 409 |
| `CannotDeactivateOwnAccountException` | 409 |
| `LastAdminException` | 409 |
| `AccountLockedException` | 423 |
| `CurrentPasswordIncorrectException` | 400 (not 401: the session is valid) |
| `NewPasswordUnchangedException` | 400 |

There must be **exactly one** `DomainException` class: `@Catch(DomainException)` matches on class identity, so a second copy makes the filter silently stop matching and every domain error becomes a `500` with a leaked stack. `src/iam/domain/exceptions/exceptions.spec.ts` loads every `*.exception.ts` file in that folder and asserts each export extends the shared base class with a 4xx status, so a new exception is checked automatically. The shared filter spec uses a local stand-in and imports no slice.

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
4. **Read the actor from `request.user`** — `JwtStrategy.validate()` reloads the account from the database, checks it is active, and attaches an `AuthenticatedUser` (`{ id, email, role }`), not the raw JWT payload and never the domain `Account`, so no hash can reach a response by accident.
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
| `REFRESH_TOKEN_EXPIRES_DAYS` | `1` | Days a refresh token stays valid (cookie max-age; also the server-side expiry once enforced). Sliding: each refresh restarts it |
| `SALT_ROUNDS` | `12` | bcrypt cost |
| `NODE_ENV` | **required** | `development`, `production` or `test`; refresh cookie is `Secure` in every environment except `development` |
| `FRONTEND_URL` | `http://localhost:5173` in development and test only; **required in production** | CORS allowlist: comma-separated origins (`scheme://host[:port]`, no path, trailing slash or wildcard). An origin not on the list gets no CORS headers |
| `PORT` | `3000` | HTTP port |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | `npm run db:seed` only. The email is lowercased; the password must meet the signup strength rule (8-20 characters, upper, lower, digit, special) or the seed refuses |

Startup validation (`src/shared/config/validate-env.ts`) refuses to boot, and the TypeORM CLI refuses to run, if a required variable is missing, if `DB_PORT`, `SALT_ROUNDS` or `REFRESH_TOKEN_EXPIRES_DAYS` is set but not a positive integer, if `FRONTEND_URL` is missing in production, or if it holds anything but bare origins. The error names variables, never values.

Password policy: 8–20 characters, `@IsPasswordStrong` (see `shared/validators/`), aligned with the React signup schema. The 20-character cap blocks passphrases and is worth revisiting.

## 10. Must not break

1. **Refresh tokens are stored hashed.** Never persist or log the plain token.
2. **No role in the JWT.** Status and role are re-read from the database per request.
3. **`passwordHash` never leaves the API.** Controllers project explicitly.
4. **Cookie set/clear options must match**, including `path`.
5. **Rotation on every refresh.** Reusing a hash defeats the design.
6. **Domain stays framework-free**, and `shared/` stays slice-free.
7. **`synchronize` stays `false`.** Schema changes are migrations, reviewed before running.
8. **The auth routes stay JSON-only and behind `SameOriginGuard`.** Removing either reopens cross-site login and logout.

## 11. Not implemented — do not assume it exists

- No per-token revocation: revoking works per account (`tokenVersion`), so it cannot cancel one device's access token and keep another's.
- Reuse detection recognises only the immediately previous refresh token, not the whole token family.
- No email verification or password reset. Signed-in password change exists (`POST /auth/change-password`); the forced change after a temporary password does not.
- No audit log of account changes.
- No CI, no Supabase, no Traefik.
- Planned hardening and design decisions: `docs/NEXT-FEATURES.md`.

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
│   └── exceptions/                   # 14 DomainException subclasses
├── application/
│   ├── ports/{account.repository.interface,accounts-query,
│   │           password-hasher.port,token.service.port,
│   │           refresh-token.port,auth-policy}
│   └── use-cases/                    # 9 use cases
├── infrastructure/
│   ├── persistence/{account.orm-entity,typeorm-account.repository}
│   └── security/{jwt.strategy,jwt-token.service,jwt-key.util,
│                 bcrypt-password-hasher,refresh-token.service,auth-cookie.util}
├── presentation/
│   ├── {auth,account}.controller.ts
│   ├── dtos/{register-account,create-account,login,change-password,accounts-list-request,   # requests
│   │         account-response,auth-session-response}                       # responses (OpenAPI)
│   └── guards/{jwt-auth.guard,roles.guard,same-origin.guard}
├── testing/{account.fixture,fake-account.repository,fake-refresh-token.service}
└── iam.module.ts
```

Shared: `src/shared/domain/domain.exception.ts`, `src/shared/filters/domain-exception.filter.ts`, `src/shared/validators/password-strength.validator.ts`, `src/shared/config/{validate-env,allowed-origins}.ts`, `src/shared/http/{require-json-body,setup-openapi}.ts`, `src/shared/database/`. Composition roots: `src/main.ts`, `src/configure-app.ts`, `src/scripts/seed-admin.ts`.

## 14. Client contract (for `fdff-front`)

Everything a browser client must do to work with this API. The machine-readable version is the OpenAPI spec at `/api/docs-json` (development only); generate types from it rather than hand-writing them.

### Transport rules

| Rule | Why |
| --- | --- |
| Base path `/api`. In development, call it same-origin through the Vite proxy (`/api` → `http://localhost:3000`) | Same origin keeps the `SameSite=Strict` cookie working |
| Send `withCredentials: true` / `credentials: 'include'` on every call | The refresh cookie only travels with credentials |
| Bodies are `application/json` only. Any other non-empty body is `415` | `requireJsonBody` |
| `logout` and `refresh` take no body | They read the cookie |
| The page's origin must be listed in the backend's `FRONTEND_URL` (exact match: scheme, host, port) | Otherwise auth routes answer `403 CrossOriginRequestException`, and CORS sends no headers |
| Send the access token as `Authorization: Bearer <token>` on `/api/accounts*` and `POST /api/auth/change-password`. Never in a query string, never in storage | Only the header is read; storing it widens XSS exposure |
| Do not send unknown fields. The validation pipe rejects any property a DTO does not declare (`400`) | e.g. signup must not include name, cédula or phone until the Athletes slice exists |

### Session lifecycle

1. **Login** `POST /api/auth/login` `{ email, password }` → `200 { accessToken, accountId, role }` plus the `refresh_token` cookie (`HttpOnly`, `Path=/api/auth`, `Max-Age` = 1 day by default). Keep `accessToken` in memory only.
2. **Page load** → `POST /api/auth/refresh` (no body). `200` = same shape as login and a rotated cookie; `401` = not signed in. Treat `401` here as "show logged out", not an error.
3. **Access token expired** (15 minutes) → any protected call returns `401`. Call refresh **once**, retry the call, and queue other requests while it runs.
4. **Refresh is single-use.** Two refreshes with the same cookie at the same time: one wins, the other gets `401`, and a late replay of the old cookie ends the whole session. Run one refresh at a time **across tabs** (Web Locks or `BroadcastChannel`), not only within a tab, and do not fire the page-load refresh twice (React StrictMode runs effects twice in development).
5. **Logout** `POST /api/auth/logout` → always `200`, clears the cookie, and revokes every access token of that account at once. Other open tabs get `401` on their next call and their refresh fails too: send them to the login page.
6. **One session per account.** Logging in elsewhere replaces the refresh token, so this device's next refresh returns `401`.
7. **After deploying the token-version change**, tokens without the `tv` claim are rejected: every user signs in once more.

### Response shapes

| Route | Success body |
| --- | --- |
| `POST /auth/register` | `201 { id, email, role: "ATHLETE", status: "PENDING" }` |
| `POST /auth/login`, `POST /auth/refresh` | `200 { accessToken, accountId, role }` |
| `POST /auth/logout` | `200`, empty body |
| `GET /accounts` | `200 { data: [{ id, email, role, status }], total, page, limit }` |
| `POST /accounts` | `201 { id, email, role, status: "ACTIVE" }` |
| `POST /accounts/activate/:id`, `/deactivate/:id` | `204`, empty body |
| `POST /auth/change-password` | `204`, empty body, refresh cookie cleared. Drop the in-memory access token and send the user to sign-in |

Errors are JSON with `statusCode`:

| Source | Body |
| --- | --- |
| Domain rule (table in section 7) | `{ statusCode, message, error: "<ExceptionName>" }`. Branch on `error`, not on `message` |
| Validation | `{ statusCode: 400, message: string[], error: "Bad Request" }` |
| Missing, invalid or revoked access token | `{ statusCode: 401, message, error: "Unauthorized" }` |
| Non-JSON body | `{ statusCode: 415, message, error: "Unsupported Media Type" }` |
| Rate limit | `{ statusCode: 429, message: "ThrottlerException: Too Many Requests" }` |
| Unexpected | `{ statusCode: 500, message: "Internal server error" }`, no details |

`message` is English prose for developers. Show your own Spanish copy.

### What each auth answer means

| Call | Status | Meaning, and what to show |
| --- | --- | --- |
| login | `401 InvalidCredentialsException` | wrong email or password (deliberately the same answer for both) |
| login | `401 AccountNotActivatedException` | right password, account `PENDING` or `INACTIVE`: "your account awaits approval" |
| login | `423 AccountLockedException` | right password, locked for 15 minutes after 5 failures |
| login, register, logout, refresh | `429` | too many tries (login 5/min, logout 5/min, refresh 10/min, register 10/hour, all per IP) |
| register | `400 AccountAlreadyExistsException` | email already registered |
| register | `400` validation | field rules below |
| refresh | `401 InvalidRefreshTokenException` | not signed in, expired, replaced or revoked: one answer for all |
| any auth route | `403 CrossOriginRequestException` | the page's origin is not in `FRONTEND_URL`: a deployment error, not a user error |
| admin routes | `403 ForbiddenRoleException` | signed in but not an `ADMIN` |
| change password | `400 CurrentPasswordIncorrectException` | the current password is wrong; the session is still valid, so do not sign the user out |
| change password | `400 NewPasswordUnchangedException` | the new password equals the current one |
| change password | `429` | 2 per 10 minutes per IP, failed attempts included |
| deactivate | `409` | `CannotDeactivateOwnAccountException`, `LastAdminException` or `AccountAlreadyInactiveException` |
| activate | `409 AccountAlreadyActiveException`; `404 AccountNotFoundException` | |

### Field rules (mirror them in the forms)

- **email:** valid address, at most 100 characters. The server trims and lowercases it, so `Ana@X.com` and `ana@x.com` are one account.
- **password (register, admin create):** 8 to 20 characters with an uppercase letter, a lowercase letter, a digit and a special character. Login only checks length 8 to 20.
- **register `role`:** optional; if sent it must be `"ATHLETE"`. Any other value is `400`.
- **`GET /accounts` query:** `email` (fragment, at most 100), `role` (`ADMIN|JUDGE|ATHLETE`), `status` (`PENDING|ACTIVE|INACTIVE`), `page` (≥ 1), `limit` (1 to 100, default 10), `sortOrder` (`ASC|DESC`). Unknown parameters are `400`.
- **`:accountId`:** a UUID, otherwise `400`.
- **change password:** `currentPassword` 8 to 20 characters; `newPassword` follows the signup password rule.

### Not available yet

No password reset, no forced change after a temporary password, no email confirmation, no athlete profile, categories, competitions or results endpoints. Do not build UI that calls them as if they existed; see section 11 and `docs/PROJECT_CONTEXT.md`.
