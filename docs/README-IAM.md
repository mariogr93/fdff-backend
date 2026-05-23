# IAM Module — Engineering Source of Truth

> **Bounded context:** Identity & Access Management for the FDFF backend.  
> **Ubiquitous term:** `Account` (not "User") — a system identity with credentials and RBAC role.

---

## 1. Overview & Context

The IAM module owns **who can access the API** and **how credentials are issued and validated**. It is the first vertical slice of the FDFF platform and underpins all future bounded contexts (Athletes, Competitions, Registrations).

**Business problems solved**

- Federation account registration (athletes self-signup; admins provision staff).
- Credential-based login with role-bearing access tokens for the frontend.
- Separation of **system identity** (`Account`) from **physical competitor data** (`CompetitorProfile` — not built here).

**Technical problems solved**

- Password hashing, JWT issuance, and PostgreSQL persistence behind stable ports.
- Authorization rules for privileged registration (`ADMIN` / `JUDGE` creation).
- Account lifecycle gates (`PENDING` / `APPROVED` / `REJECTED`) and brute-force mitigations (rate limits, lockout, timing-safe login).

---

## 2. Core Architecture & Patterns

**Patterns:** Tactical DDD + Hexagonal (Ports & Adapters) inside a NestJS vertical slice.

| Principle | Rule |
|-----------|------|
| Dependency direction | `presentation` → `application` → `domain` ← `infrastructure` |
| Domain purity | `domain/` must **not** import `@nestjs/*`, TypeORM, Passport, or bcrypt |
| Entity split | `Account` (domain) ≠ `AccountOrmEntity` (persistence) ≠ HTTP DTOs |
| DI tokens | Ports use `Symbol` or string tokens; adapters live in `infrastructure/` |

**Directory layout**

```
src/iam/
├── iam.module.ts                 # Nest wiring (controllers, providers, JWT/TypeORM imports)
├── README-IAM.md                 # This file
│
├── domain/                       # Pure business vocabulary & invariants
│   ├── account.model.ts          # Aggregate root (identity)
│   ├── enums/
│   │   ├── user-roles.enums.ts   # ADMIN | JUDGE | ATHLETE
│   │   └── account-status.enum.ts # PENDING | APPROVED | REJECTED
│   └── exceptions/               # DomainException subclasses (HTTP code in ctor)
│
├── application/                  # Use cases & port interfaces
│   ├── ports/
│   │   ├── account.repository.interface.ts
│   │   ├── password-hasher.port.ts
│   │   └── token.service.port.ts
│   └── use-cases/
│       ├── register-account.use-case.ts
│       └── login-account.use-case.ts
│
├── infrastructure/             # Framework & DB adapters
│   ├── persistence/
│   │   ├── account.orm-entity.ts
│   │   └── typeorm-account.repository.ts
│   └── security/
│       ├── bcrypt-password-hasher.ts
│       ├── jwt-token.service.ts
│       ├── jwt.strategy.ts
│       └── jwt-payload.interface.ts
│
└── presentation/                 # HTTP delivery
    ├── auth.controller.ts
    └── dtos/
        ├── register-account.dto.ts
        └── login.dto.ts
```

**Shared cross-cutting pieces** (outside `iam/` but IAM-dependent):

```
src/shared/
├── database/           # TypeORM root config, SQL schema seed, TS admin seed
├── filters/            # DomainExceptionFilter (global)
└── guards/
    ├── jwt-auth.guard.ts       # Passport JWT guard (ready; not on routes yet)
    └── register-role.guard.ts  # Privileged registration authorization
```

---

## 3. What We Have Built So Far

### HTTP API (`AuthController`)

| Method | Path | Throttle (per IP) | Guards |
|--------|------|-------------------|--------|
| `POST` | `/auth/register` | x / hour | `RegisterRoleGuard` |
| `POST` | `/auth/login` | x / minute | — |

Global throttle (app-level): **X req/min** via `ThrottlerGuard`.

### Use cases

- **`RegisterAccountUseCase`** — duplicate email check, bcrypt hash, persist `Account` (default public role: `ATHLETE`, status: `PENDING`).
- **`LoginAccountUseCase`** — timing-safe credential check, account lockout, `APPROVED`-only login, JWT issuance, failed-attempt tracking.

### Domain model (`Account`)

| Field | Notes |
|-------|--------|
| `id` | UUID |
| `email` | Unique login identifier |
| `passwordHash` | bcrypt only in persistence |
| `role` | `ADMIN` \| `JUDGE` \| `ATHLETE` |
| `status` | `PENDING` \| `APPROVED` \| `REJECTED` |
| `failedLoginAttempts` | Soft lockout counter |
| `lockedUntil` | Nullable; 15-minute lock after 5 failed logins |

### Ports & adapters

| Port | Token | Implementation |
|------|-------|----------------|
| `IAccountRepository` | `'I_ACCOUNT_REPOSITORY'` | `TypeOrmAccountRepository` |
| `IPasswordHasherPort` | `Symbol('I_PASSWORD_HASHER')` | `BcryptPasswordHasher` |
| `ITokenServicePort` | `Symbol('I_TOKEN_SERVICE')` | `JwtTokenService` |

Repository methods: `findById`, `findByEmail`, `save`, `update`.

### Security infrastructure

- **`JwtTokenService`** — signs/verifies JWT; payload is **identity-only** (`sub`, `email`).
- **`JwtStrategy`** — loads `Account` from DB on each validated request; enforces `APPROVED` status.
- **`BcryptPasswordHasher`** — `SALT_ROUNDS` from env (default 10).
- **`RegisterRoleGuard`** — DB-backed check: only `APPROVED` `ADMIN` may create `ADMIN`/`JUDGE` accounts.

### Domain exceptions (mapped by `DomainExceptionFilter`)

| Exception | HTTP |
|-----------|------|
| `InvalidCredentialsException` | 401 |
| `AccountNotApprovedException` | 401 |
| `AccountLockedException` | 423 |
| `AccountAlreadyExistsException` | 400 |
| `ForbiddenRoleAssignmentException` | 403 |

### Bootstrap & schema (shared)

- SQL schema: `src/shared/database/seeds/001-initial-setup.sql` (Docker init + `npm run db:schema`).
- Admin seed: `src/shared/database/seed-admin.ts` (`npm run db:seed`, env: `ADMIN_EMAIL`, `ADMIN_PASSWORD`).

### Module entry

- **`iam.module.ts`** — exports `RegisterAccountUseCase`, `LoginAccountUseCase`; registered in `AppModule`.

---

## 4. How It Works (Data & Control Flow)

### Registration (`POST /auth/register`)

```
Client
  → ValidationPipe (RegisterAccountDto)
  → RegisterRoleGuard
       · ATHLETE (or omitted): allow
       · ADMIN/JUDGE: verify JWT → load Account from DB → must be APPROVED ADMIN
  → AuthController
  → RegisterAccountUseCase
       · findByEmail → duplicate? AccountAlreadyExistsException
       · passwordHasher.hash
       · new Account(..., role, PENDING)
       · accountRepo.save
  → JSON { id, email, role, status }  (no password hash)
```

### Login (`POST /auth/login`)

```
Client
  → ValidationPipe (LoginDto)
  → AuthController
  → LoginAccountUseCase
       · findByEmail
       · lockedUntil in future? → AccountLockedException
       · bcrypt compare 
       · invalid? increment failedLoginAttempts; lock at 5; update; InvalidCredentialsException
       · valid? reset attempts; update
       · status !== APPROVED? → AccountNotApprovedException
       · tokenService.sign({ id, email })
  → JSON { accessToken, accountId, role }
```

### JWT validation (when `JwtAuthGuard` is applied)

```
Authorization: Bearer <token>
  → Passport JwtStrategy.validate
       · findById(payload.sub)
       · missing / not APPROVED → UnauthorizedException
       · return Account → request.user
  → Route handler
```



### Key dependencies

| Package / module | Role |
|----------------|------|
| `@nestjs/typeorm` + `pg` | `accounts` table |
| `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt` | JWT |
| `bcrypt` | Password hashing |
| `@nestjs/throttler` | Rate limiting (app + auth overrides) |
| `@nestjs/config` | `JWT_SECRET`, `JWT_EXPIRES_IN`, `SALT_ROUNDS`, etc. |
| `class-validator` / `class-transformer` | DTO validation |

---

## 5. Critical Technical Details & Rules

### Must not break

1. **Domain layer imports** — no Nest, TypeORM, or infra in `domain/`.
2. **Password never in API responses** — controller returns safe fields only.
3. **JWT payload** — only `sub` + `email`; **never** embed `role` or `status` (load from DB in `JwtStrategy`).
4. **Login timing safety** — always run bcrypt `compare` even when email is unknown (`DUMMY_HASH`).
5. **Status enforcement** — login requires `APPROVED`; JWT strategy re-checks status from DB on every request.
6. **Registration authorization** — public signup is `ATHLETE` only; `ADMIN`/`JUDGE` require live `APPROVED` admin in DB (not JWT claims alone).
7. **Port-based DI** — use cases depend on interfaces, not concrete adapters.
8. **Domain exceptions** — use `DomainException` subclasses for predictable HTTP mapping; do not leak stack traces from JWT library errors (`JwtTokenService` wraps verify in `UnauthorizedException`).

### Environment variables (IAM-relevant)

```env
JWT_SECRET=              # Required; startup fails if missing (getOrThrow)
JWT_EXPIRES_IN=15m        # Access token TTL
SALT_ROUNDS=10            # bcrypt cost (4–31)
ADMIN_EMAIL=              # npm run db:seed
ADMIN_PASSWORD=           # Quote if value contains $
```

### Validation (DTOs)

- Email: `@IsEmail()`, `@MaxLength(100)`
- Password: `@MinLength(8)`, `@MaxLength(72)` (bcrypt byte limit)
- Register `role`: optional, defaults to `ATHLETE` via `@Transform`

### Database

- Table: `accounts` (PostgreSQL enums `account_role`, `account_status`).
- Dev: TypeORM `synchronize: true` when `NODE_ENV !== 'production'`.
- Prod: apply `001-initial-setup.sql`; run `npm run db:seed` for initial admin.

---

## 6. Roadmap & Future Development Considerations

### Missing / not implemented

| Item | Notes |
|------|--------|
| **Global or route JWT protection** | `JwtAuthGuard` unused; no `@Roles()` guard yet |
| **Refresh tokens / logout** | Single access JWT only |
| **Email verification** | Accounts stay `PENDING` until manual DB/admin workflow |
| **Password reset** | No flow |
| **Account management API** | Approve/reject/suspend users (admin CRUD) |
| **`RolesGuard` + `@Roles()`** | Referenced in PROJECT_CONTEXT; not in codebase |
| **E2E / unit tests** | IAM flows tested manually (curl) |
| **Email enumeration on lockout** | `AccountLockedException` vs `InvalidCredentialsException` can reveal account state |
| **Uniform error on wrong password vs not approved** | Approved account with valid password still gets distinct `AccountNotApprovedException` |

### Technical debt & placeholders

- `RegisterRoleGuard` duplicates JWT verify logic instead of reusing `JwtAuthGuard` + metadata.
- `update()` and `save()` on repository are identical (both call TypeORM `save`).
- Initial admin requires SQL seed or `db:seed` (no self-serve first `ADMIN` via API).
- Lockout constants (`5` attempts, `15` min) are hardcoded in `LoginAccountUseCase` — consider env/config.

### Adding a new IAM feature (checklist)

1. **Domain first** — enums, exceptions, model changes in `domain/` (no frameworks).
2. **Port** — extend `IAccountRepository` or add a new port in `application/ports/`.
3. **Use case** — orchestrate via injected ports; throw domain exceptions.
4. **Infrastructure** — adapter implementation only in `infrastructure/`.
5. **Presentation** — DTO + controller method; apply `@Throttle` / guards as needed.
6. **Wire** — register providers in `iam.module.ts`; export use case if other modules need it.
7. **Schema** — update `001-initial-setup.sql` + rely on sync or add migration.
8. **Do not** put business rules in controllers or ORM entities.

### Suggested next slices (priority order)

1. Apply `JwtAuthGuard` globally with `@Public()` on `/auth/register` and `/auth/login`.
2. Implement `RolesGuard` for admin-only routes.
3. Admin use cases: approve/reject `Account` status (fixes `PENDING` athlete workflow).
4. Registration saga hook: create `CompetitorProfile` after athlete `Account` (Athletes bounded context).
5. Refresh token rotation and token revocation list (if compliance requires).

---

## Quick reference — file map

| Concern | Primary file |
|---------|----------------|
| Module bootstrap | `iam.module.ts` |
| HTTP routes | `presentation/auth.controller.ts` |
| Register logic | `application/use-cases/register-account.use-case.ts` |
| Login + lockout | `application/use-cases/login-account.use-case.ts` |
| DB mapping | `infrastructure/persistence/typeorm-account.repository.ts` |
| JWT sign/verify | `infrastructure/security/jwt-token.service.ts` |
| Request auth (Passport) | `infrastructure/security/jwt.strategy.ts` |
| Privileged register | `../shared/guards/register-role.guard.ts` |
| Exception → HTTP | `../shared/filters/domain-exception.filter.ts` |

For platform-wide conventions, see [`docs/PROJECT_CONTEXT.md`](../../docs/PROJECT_CONTEXT.md).
