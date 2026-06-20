# AI Auth Context — FDFF (React SPA + NestJS API)

> **Audience:** AI coding assistants only. Dense reference. Not human docs.
> **Repos:** `fdff-front` (React), `fdff-backend` (NestJS)
> **Human docs:** `fdff-front/docs/react-auth-*.md`, `fdff-backend/docs/nestjs-auth-*.md`, `fdff-backend/docs/README-IAM.md`

---

## ARCHITECTURE (ONE SCREEN)

- **Pattern:** In-Memory Access JWT + HttpOnly Refresh Cookie (NOT localStorage, NOT BFF yet)
- **Access token:** RS256 JWT, TTL `JWT_EXPIRES_IN` (default `15m`), claims `sub`+`email` ONLY
- **Refresh token:** Opaque `base64url` (48 bytes), TTL `REFRESH_TOKEN_EXPIRES_DAYS` (default `7`), SHA-256 hash in DB
- **Access transport:** `Authorization: Bearer <token>` header
- **Refresh transport:** Cookie `refresh_token`; flags: `httpOnly`, `sameSite:strict`, `path:/api/auth`, `secure` in prod
- **API prefix:** `/api` (Nest `setGlobalPrefix('api')`)
- **CORS:** `FRONTEND_URL`, `credentials:true`
- **Frontend dev proxy:** Vite `/api` → backend; `withCredentials:true` on all Axios clients

---

## STRICT RULES (MUST FOLLOW)

### Frontend

- **RULE:** NEVER store access/refresh tokens in `localStorage`, `sessionStorage`, IndexedDB, or JS-readable cookies
- **RULE:** Access token ONLY in `auth-session.store.ts` (module closure) + `AuthProvider` React state
- **RULE:** NEVER read/log/expose refresh token in JS — it is HttpOnly server-set only
- **RULE:** ALL authenticated HTTP calls MUST use `apiClient` or `uploadApiClient` from `src/config/api.ts` — never raw `fetch()` or new `axios.create()` for protected routes
- **RULE:** NEVER import React Context (`useAuth`) inside `api.ts` or services — use `auth-session.store.ts` bridge
- **RULE:** NEVER manually attach `Authorization` in components — request interceptor handles it
- **RULE:** NEVER manually call `/auth/refresh` in feature code — response interceptor + `refreshClient` handles 401 replay
- **RULE:** Login success MUST call `setSession({ accessToken, accountId, role })` — syncs store + Context
- **RULE:** Logout MUST call `clearSession()` from `useAuth()` — do not only clear React state
- **RULE:** Signup API payload = `{ email, password, role }` ONLY — profile fields via `toSignupProfileDraft()`, not auth API
- **RULE:** Register validation = Zod `signup.schema.ts` + `@IsPasswordStrong` mirror on backend; login password = length only (no entropy on login)
- **RULE:** Public Axios paths (no Bearer): `/auth/login`, `/auth/register`, `/auth/refresh` — defined in `PUBLIC_AUTH_PATHS`
- **RULE:** Token refresh MUST use `refreshClient` (no interceptors) inside `api.ts` — prevents infinite refresh loops
- **RULE:** Failed refresh → `notifyAuthFailure()` → clear session → redirect `/login` — do not swallow 401 refresh errors

### Backend

- **RULE:** NEVER return `passwordHash`, `refreshToken` plaintext, or `refreshTokenHash` in JSON responses
- **RULE:** NEVER embed `role` or `status` in JWT payload — load from DB in `JwtStrategy.validate()`
- **RULE:** ONLY store `hashRefreshToken(plain)` in `accounts.refresh_token_hash` — never plaintext refresh in DB
- **RULE:** Refresh token ONLY via `Set-Cookie` on login/refresh — NEVER in response body
- **RULE:** ALL new **protected** controllers/routes MUST use `@UseGuards(JwtAuthGuard)` unless explicitly public
- **RULE:** Privileged registration (`ADMIN`/`JUDGE` role in body) requires `RegisterRoleGuard` — public signup = `ATHLETE` only
- **RULE:** Business logic in **use cases** — controllers thin (DTO → use case → response)
- **RULE:** `domain/` MUST NOT import `@nestjs/*`, TypeORM, Passport, bcrypt
- **RULE:** Throw `DomainException` subclasses for business errors — not generic `Error`
- **RULE:** DTOs MUST use `class-validator`; global `ValidationPipe`: `whitelist`, `forbidNonWhitelisted`, `transform`
- **RULE:** Login MUST remain timing-safe (bcrypt compare on `DUMMY_HASH` when email unknown)
- **RULE:** Login + JWT validation require `AccountStatus.APPROVED`
- **RULE:** Refresh MUST rotate token (new plain → new hash → overwrite DB) on every success
- **RULE:** RS256 ONLY — `algorithms:['RS256']`; keys from `JWT_PRIVATE_KEY_PATH`/`JWT_PUBLIC_KEY_PATH`
- **RULE:** Password hashing = `BcryptPasswordHasher` (bcrypt + SHA-256 pre-hash), `SALT_ROUNDS` default `12` — NOT Argon2 (not implemented)
- **RULE:** Do NOT add auth logic to ORM entities or controllers beyond guards/cookies/throttle

---

## FRONTEND FILE MAP

| Path | Role |
|------|------|
| `src/config/api.ts` | `apiClient`, `uploadApiClient`, `isRefreshing`, `failedQueue`, request/response interceptors, `refreshClient` |
| `src/auth/auth-session.store.ts` | `getAccessToken`, `setAccessToken`, `notifySessionRefreshed`, `notifyAuthFailure`, `registerAuthLifecycleHandlers` |
| `src/context/AuthProvider.tsx` | `useAuth()`, `setSession`, `clearSession`, lifecycle handler registration |
| `src/services/Auth.service.ts` | `login`, `register`, `refresh` (refresh rarely called directly) |
| `src/types/authentication.models.ts` | `LoginRequest/Response`, `RegisterRequest/Response`, `RefreshResponse` |
| `src/schemas/*.schema.ts` | Zod: `login.schema`, `signup.schema`, `auth-fields.schema` |
| `src/utils/login.mapper.ts` | Form → `LoginRequest` |
| `src/utils/signup.mapper.ts` | Form → `RegisterRequest` (strips profile fields) |
| `src/pages/AuthPage.tsx` | Login/register orchestration, `setSession` on login |
| `src/components/Header.tsx` | `isAuthenticated`, `clearSession` |
| `src/main.jsx` | `BrowserRouter` → `AuthProvider` → routes |

---

## BACKEND FILE MAP

| Path | Role |
|------|------|
| `src/iam/presentation/auth.controller.ts` | `POST /auth/register|login|refresh`, cookies, `@Throttle` |
| `src/iam/presentation/dtos/login.dto.ts` | Login DTO |
| `src/iam/presentation/dtos/register-account.dto.ts` | Register DTO + `@IsPasswordStrong()` |
| `src/iam/application/use-cases/login-account.use-case.ts` | bcrypt verify, lockout, refresh gen, access JWT |
| `src/iam/application/use-cases/refresh-account.use-case.ts` | hash lookup, rotation, new access JWT |
| `src/iam/application/use-cases/register-account.use-case.ts` | duplicate check, hash, save `PENDING` |
| `src/iam/infrastructure/security/jwt.strategy.ts` | Passport JWT, `validate()` → `Account` |
| `src/iam/infrastructure/security/jwt-token.service.ts` | RS256 sign/verify |
| `src/iam/infrastructure/security/jwt-key.util.ts` | PEM key loader |
| `src/iam/infrastructure/security/auth-cookie.util.ts` | `REFRESH_TOKEN_COOKIE`, `buildRefreshTokenCookieOptions` |
| `src/iam/infrastructure/security/bcrypt-password-hasher.ts` | `IPasswordHasher` adapter |
| `src/shared/guards/jwt-auth.guard.ts` | `AuthGuard('jwt')` — USE ON PROTECTED ROUTES |
| `src/shared/guards/register-role.guard.ts` | Admin-only privileged registration |
| `src/iam/infrastructure/security/refresh-token.util.ts` | `generateRefreshToken`, `hashRefreshToken` |
| `src/shared/validators/password-strength.validator.ts` | `@IsPasswordStrong()` |
| `src/shared/filters/domain-exception.filter.ts` | `DomainException` → HTTP |
| `src/main.ts` | `cookieParser`, CORS, `ValidationPipe`, `helmet`, prefix `api` |
| `src/app.module.ts` | Global `ThrottlerGuard` 100/min |
| `src/iam/iam.module.ts` | JWT/Passport wiring, use case DI |

---

## LIBRARIES (EXACT)

**Frontend:** `react`, `react-router-dom`, `axios`, `zod`, `react-hook-form`, `@hookform/resolvers/zod`, `typescript`, `vite`

**Backend:** `@nestjs/common`, `@nestjs/config`, `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `@nestjs/throttler`, `@nestjs/typeorm`, `typeorm`, `pg`, `class-validator`, `class-transformer`, `bcrypt`, `cookie-parser`, `helmet`

---

## API ENDPOINTS

| Method | Path | Auth | Throttle | Notes |
|--------|------|------|----------|-------|
| POST | `/api/auth/register` | Public (+`RegisterRoleGuard` for ADMIN/JUDGE) | 10/hr | Returns `{id,email,role,status}` |
| POST | `/api/auth/login` | Body credentials | 5/min | JSON `{accessToken,accountId,role}` + Set-Cookie |
| POST | `/api/auth/refresh` | Cookie `refresh_token` | 10/min | Rotates cookie + new accessToken JSON |
| * | `/api/*` protected | Bearer JWT | 100/min global | `@UseGuards(JwtAuthGuard)` required on new routes |

---

## FLOWS (COMPRESSED)

### Login
1. FE: Zod validate → `AuthService.login` → `POST /auth/login` (no Bearer, `withCredentials`)
2. BE: `LoginDto` → `LoginAccountUseCase` → bcrypt, lockout, `APPROVED` check → gen refresh+hash → `tokenService.sign` → cookie + JSON
3. FE: `setSession()` → navigate `/`

### Silent refresh (automatic)
1. Protected call → 401 (expired access JWT)
2. If `isRefreshing`: queue in `failedQueue`
3. Else: `refreshClient.post('/auth/refresh')` with cookie
4. Success: `notifySessionRefreshed` → `processQueue` → replay with new Bearer
5. Fail: `notifyAuthFailure` → `/login`
6. Excluded from retry: `/auth/login`, `/auth/register`, `/auth/refresh`, `_retry` requests

### Refresh (backend)
1. Read `req.cookies.refresh_token`
2. `hashRefreshToken` → `findByRefreshTokenHash`
3. Invalid/missing → `InvalidRefreshTokenException` (401)
4. Gen new plain+hash → `update` account → sign access JWT → Set-Cookie new plain → JSON access only

### JWT request auth (backend protected routes)
1. `JwtAuthGuard` → Bearer extract → RS256 verify
2. `JwtStrategy.validate(sub)` → `findById` → must be `APPROVED` → `request.user = Account`

---

## DOMAIN MODEL (BACKEND)

**Account:** `id`, `email`, `passwordHash`, `role` (`ADMIN|JUDGE|ATHLETE`), `status` (`PENDING|APPROVED|REJECTED`), `failedLoginAttempts`, `lockedUntil`, `refreshTokenHash`

**Exceptions → HTTP:** `InvalidCredentials` 401, `InvalidRefreshToken` 401, `AccountNotApproved` 401, `AccountLocked` 423, `ForbiddenRoleAssignment` 403, `AccountAlreadyExists` 400

---

## ENV VARS

**Backend:** `JWT_PRIVATE_KEY_PATH`, `JWT_PUBLIC_KEY_PATH`, `JWT_EXPIRES_IN=15m`, `REFRESH_TOKEN_EXPIRES_DAYS=7`, `SALT_ROUNDS=12`, `FRONTEND_URL`, `NODE_ENV`, `DB_*`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`

**Frontend:** `VITE_API_BASE_URL` (optional; dev uses `/api`), `VITE_API_TIMEOUT` (default 10000)

---

## NOT IMPLEMENTED (DO NOT ASSUME EXISTS)

- `POST /auth/logout` (cookie clear server-side)
- `RolesGuard` / `@Roles()` decorator (sketch in nestjs-auth-docs only)
- Global `JwtAuthGuard` + `@Public()` opt-out
- Bootstrap refresh on FE page load (in-memory token lost on hard refresh)
- Argon2 password hasher
- Refresh token family / reuse detection beyond hash rotation
- `JwtAuthGuard` on existing business controllers (guard exists, routes unprotected)

---

## ADDING CODE (AI CHECKLIST)

**FE new API feature:**
- Service file → `import apiClient from '../config/api'`
- No token handling in component
- Gate UI with `useAuth().isAuthenticated` if needed before call

**BE new protected endpoint:**
- DTO with `class-validator`
- `@UseGuards(JwtAuthGuard)` on controller/method
- Use case receives `accountId` from `req.user.id`
- `@Throttle` if public/abuse-prone
- Domain exception for business failures

**BE new auth endpoint:**
- Cookie vs Bearer decision explicit
- Never return refresh in JSON
- Hash before DB write

---

## ANTI-PATTERNS (REJECT IN REVIEW)

- `localStorage.setItem('token'`
- `axios.create()` in feature modules
- `role` in JWT payload
- Plaintext refresh in DB/logs/JSON
- Auth logic in React components (beyond `setSession`/`clearSession`)
- TypeORM/Passport imports in `domain/`
- Protected route without `JwtAuthGuard`
- Skipping DTO validation on new endpoints
