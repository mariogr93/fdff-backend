# fdff-backend

API of the FDFF WebApp (Federación Dominicana de Fisicoculturismo y Fitness): athlete registration, competitions, categories and their eligibility rules, registration approvals, and results. The web client lives in the separate **fdff-front** repository (React).

**Current reality:** only the IAM slice exists — accounts, authentication, and admin account management. Athletes, categories, competitions, registrations and results are **not built**. `docs/PROJECT_CONTEXT.md` describes the intended domain; treat it as the specification, not as a description of what is here.

## Commands

```bash
docker compose up -d db       # Postgres on ${DB_PORT:-5432} (5433 locally)
npm run start:dev             # NestJS in watch mode
npm run build
npm run lint                  # ESLint + prettier, autofixes
npm run test                  # unit + controller specs, no database needed
npm run test:e2e              # boots the real AppModule: needs live DB + keys/*.pem
npm run migration:generate -- src/shared/database/migrations/<Name>
npm run migration:run
npm run db:seed               # initial admin from ADMIN_EMAIL / ADMIN_PASSWORD
```

Before calling a task done, run `npm run build && npm run test && npm run lint` and fix what fails. `src/` currently lints clean — keep it that way.

## Stack

NestJS 11 + TypeScript, PostgreSQL via TypeORM 0.3, Passport JWT (RS256), bcrypt, class-validator, helmet, @nestjs/throttler, Docker Compose.

**Not installed. Do not import these** — propose adding one when a feature needs it: `@nestjs/swagger`, `@supabase/supabase-js`. There is also no CI (`.github/` does not exist) and no Traefik, despite what `PROJECT_CONTEXT.md` lists as the target infrastructure.

## Non-negotiable rules

1. **Ubiquitous language.** Classes, variables, endpoints and tables use the domain terms exactly (see below). Never `User` for physical or competition data; never `Type` or `Division` for Category.
2. **Domain purity.** Nothing under a `domain/` folder imports `@nestjs/*`, `typeorm`, `class-validator`, or any SDK. `Account` takes its lockout thresholds as a plain `LockoutPolicy` argument precisely so it never reads configuration.
3. **Business rules live in the domain**, never in controllers or repositories. A repository method that encodes a business operation — the deleted `repo.activate()` did — is a bug.
4. **The shared kernel depends on nothing.** `src/shared/` must not import from `src/iam/` or any future slice. Code that legitimately needs a slice and is still cross-cutting is a composition root and belongs in `src/scripts/`, like `seed-admin.ts`.
5. **Deny by default.** Every non-public endpoint carries `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles(...)`. Prefer the class level so a new method cannot be added unguarded.
6. **Every schema change is a migration.** `synchronize` is `false` in all environments. Generate, **read the SQL**, then run. TypeORM emits `DROP COLUMN` + `ADD COLUMN` for a type change, which destroys data — replace it with `ALTER COLUMN ... TYPE`.
7. **Never log personal data or secrets** — no cédulas, birthdates, tokens or token hashes. A `console.log` of a refresh-token hash was removed from the refresh use case; don't reintroduce that shape.
8. **Never commit secrets.** Configuration comes from environment variables; add new ones to `.env.example`. `.env` and `keys/*.pem` are gitignored.
9. **Named, explicit DI tokens.** Ports are `Symbol`/string tokens in `application/ports/`; adapters live in `infrastructure/`. A use case must never import a TypeORM repository.

## Domain language

| Term | Meaning |
| --- | --- |
| Account | Login identity (email, password hash) with a role: ADMIN, JUDGE, ATHLETE |
| Athlete / CompetitorProfile | A physical competitor: cédula, names, sex, birthdate, height, photo |
| Cédula | Dominican national ID: 11 digits, stored without hyphens, unique per athlete |
| Category / CategoryDefinition | Competitive branch with rules on sex, age, height and weight |
| Competition | An official federation show (sanctioned event) |
| EventRegistration | One athlete × one category × one competition, with its own status |
| Weigh-In / Check-In | Physical validation of an athlete against a category's rules |

**Two lifecycles that are easy to confuse:**

- `Account.status` is `PENDING | ACTIVE | INACTIVE`. An **admin activates an account** so a person can sign in.
- `EventRegistration.status` will be `PENDING | APPROVED | REJECTED`. A **judge approves a registration** so an athlete can compete.

There is no `APPROVED` or `REJECTED` account status, and no `AccountNotApprovedException`. Deactivating a `PENDING` account is how a registration-level rejection is expressed at the account level.

## Key business rules

- An athlete can register in several categories of one competition; each EventRegistration is approved or rejected independently.
- A registration is only valid for categories whose sex, age, height and weight rules the athlete meets.
- Required athlete data: cédula, first name, last name, plus every attribute the chosen categories depend on. Reject a registration missing one.
- Athletes register themselves or through a coach; each registration records team name, coach name, and who submitted it.
- ADMIN creates judge accounts. ADMIN and JUDGE create competitions and categories, approve or reject registrations (individually or in bulk), and edit athlete data. All edits are audited.

Pending data-model decisions are in `docs/architecture/backend-implications.md`. **Read it before changing entities**, and mark items resolved with the date when they are decided.

## Architecture: tactical DDD + vertical slices

No global `controllers/` or `services/` folders. Each business capability is self-contained, and dependencies point inward: `presentation → application → domain`, with `infrastructure` implementing the application's ports.

```
src/
├── main.ts                  # thin: delegates to configure-app.ts
├── configure-app.ts         # cookie parser, /api prefix, CORS, helmet,
│                            #   ValidationPipe, DomainExceptionFilter.
│                            #   Shared with e2e tests so both run one pipeline.
├── app.module.ts            # global ThrottlerGuard (100 req/min)
├── scripts/                 # composition roots: seed-admin.ts
├── shared/                  # cross-cutting, depends on no slice
│   ├── domain/              # DomainException — the one base class
│   ├── database/            # data-source.ts (CLI), database.module.ts, migrations/
│   ├── filters/             # DomainExceptionFilter
│   └── validators/          # @IsPasswordStrong
└── iam/                     # Accounts and authentication
    ├── domain/              # account.model.ts, enums/, exceptions/
    ├── application/
    │   ├── ports/           # repository + hasher + token + auth-policy
    │   └── use-cases/
    ├── infrastructure/
    │   ├── persistence/     # *.orm-entity.ts, typeorm-account.repository.ts
    │   └── security/        # JWT, bcrypt, cookies, refresh-token utils
    ├── presentation/        # controllers, dtos/, guards/
    ├── testing/             # makeAccount fixture + FakeAccountRepository
    └── iam.module.ts
```

- `application/` depends on **ports**, never on TypeORM.
- Ports must not import from `presentation/`. The accounts filter shape lives in `application/ports/accounts-query.ts` for this reason; the DTO maps HTTP onto it.
- Features talk through use cases or exported ports, never by importing another slice's ORM entity.
- **Authorization is IAM's.** `JwtAuthGuard` and `RolesGuard` live in `iam/presentation/guards/` and are exported by `IamModule`. A future slice that guards a route must import `IamModule`, because `JwtAuthGuard` resolves the `'jwt'` strategy registered there.

### Three separate models per concept

| Model | Location | Purpose |
| --- | --- | --- |
| Domain model | `domain/<feature>.model.ts` | Business rules and invariants |
| ORM entity | `infrastructure/persistence/<feature>.orm-entity.ts` | Table mapping |
| DTO | `presentation/dtos/` | HTTP input validation |

Map between them explicitly. **Never return an ORM entity from a controller** — controllers project to a plain object, which is what keeps `passwordHash` out of responses.

## Conventions

- File names: `register-athlete.use-case.ts`, `athlete.model.ts`, `athlete.orm-entity.ts`, `athletes.controller.ts`.
- Relative imports only. Do not use `src/...` absolute paths; they resolve under `nest build` but need a jest `moduleNameMapper` to work in tests.
- Domain errors extend `DomainException` with their HTTP status in the constructor; `DomainExceptionFilter` maps them. **There must be exactly one `DomainException` class** — `@Catch()` matches on class identity, so a duplicate silently turns every domain error into a 500 with a leaked stack. A spec guards this.
- Error messages are currently human-readable English prose. The frontend does **not** read them: it catches bare and shows its own Spanish copy. Stable error codes (`CATEGORY_HEIGHT_EXCEEDED`) are a good idea but are **not implemented on either side** — a cross-repo decision, not something to half-build.
- Bulk operations return per-item success or failure, never all-or-nothing silently. None exist yet.

## Testing

- Unit-test domain models and value objects with no Nest and no database — `src/iam/domain/account.model.spec.ts` is the pattern.
- Use-case tests inject the in-memory fakes from `src/iam/testing/`. `makeAccount(overrides)` is the **only** place tests construct an `Account`; keep it that way so a constructor change is a one-file fix.
- Controller tests build a testing module, stub the guards open, and wrap it in `configureApp` — so the status codes they assert are the ones a client actually receives. See `account.controller.spec.ts`.
- `ThrottlerGuard` is a global `APP_GUARD`, so a controller test needs `ThrottlerModule` imported or the guard overridden.

## Known gaps

- **No OpenAPI spec.** `@nestjs/swagger` is not installed, so API types in `fdff-front/src/types/` are hand-written. Adding Swagger is its own task; `fdff-front/CLAUDE.md` says the same.
- **No CI.** No `.github/` directory, so nothing runs build/test/lint automatically.
- **The login throttle (5/min) is tighter than the lockout threshold (5 attempts)**, so from a single IP the throttler fires first and the account-lockout path is nearly unreachable. It still matters for distributed attempts.
- **Open security findings** are catalogued in `DevSecOps_SecurityAudit.md` (untracked). Several are stale: server-side logout now exists, and `/accounts` is guarded.
- `docs/nestjs-auth-changelog.md` is history and is not maintained as a reference.

## Documentation map

| Need | Read |
| --- | --- |
| Domain, ubiquitous language, bounded contexts, target architecture | `docs/PROJECT_CONTEXT.md` |
| IAM: endpoints, flows, domain model, ports, exceptions, env vars | `docs/README-IAM.md` |
| Pending data-model decisions | `docs/architecture/backend-implications.md` |
| Database setup, migrations workflow, account creation | `README.md` |
| Frontend contract, design system, Spanish copy | `../fdff-front/CLAUDE.md` |
| Federation decisions log (D1–D11) | `../fdff-front/docs/design/README.md` |

Read only what the task needs.

## How to work

- **Plan first** for anything touching more than one file: list the files you'll change and why, then implement.
- **One feature slice per change.** Don't refactor unrelated code.
- **Verify, don't assume.** Check behaviour against the running API or a test, not against these docs. If a doc and the code disagree, the code wins — then fix the doc.
- **Ask, don't guess,** when a business rule is ambiguous (scoring method, category limits, whether age is computed on the competition date or by birth year). Record the answer in `docs/architecture/`.
- **Don't invent endpoints.** If the API lacks something the frontend needs, say so.
- **Update docs in the same change** when behaviour or a rule changes.
