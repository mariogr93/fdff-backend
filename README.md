# fdff-backend

Backend API for the FDFF WebApp (Federación Dominicana de Fisicoculturismo y Fitness) — athlete registration, competitions, categories, registration approvals and results. The web client lives in the separate `fdff-front` repository.

Only the IAM slice (accounts and authentication) is implemented so far. See [CLAUDE.md](CLAUDE.md) for the project overview and [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) for the intended domain.

Connect to the local database with:

```bash
docker compose exec db psql -U db_user -d fdff_db
```

## Database setup

PostgreSQL runs via Docker Compose:

```bash
docker compose up -d db
```

Copy `.env.example` to `.env` and adjust `DB_*` values if needed (defaults match `docker-compose.yml`).

- **Schema:** owned by TypeORM migrations in [src/shared/database/migrations/](src/shared/database/migrations/). The CLI connection lives in [src/shared/database/data-source.ts](src/shared/database/data-source.ts); the running app uses [src/shared/database/database.module.ts](src/shared/database/database.module.ts). `synchronize` is **off in every environment** — the entity decorators are the source of truth for *generating* migrations, never for mutating a live database.
- **Initial admin (TypeScript):** [src/scripts/seed-admin.ts](src/scripts/seed-admin.ts) — reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`, hashes with bcrypt, inserts via `TypeOrmAccountRepository`. Skips if the email already exists (never overwrites passwords).

**Reset database from scratch:**

```bash
docker compose down -v
docker compose up -d db
npm run migration:run
npm run db:seed
```

The app also runs pending migrations on boot (`migrationsRun: true`), so `docker compose up` alone is enough; `migration:run` is for when you want the schema before starting the API.

**Changing the schema:**

```bash
# 1. edit the *.orm-entity.ts decorators
# 2. generate the diff against your current database
npm run migration:generate -- src/shared/database/migrations/DescribeTheChange
# 3. read the generated SQL before running it
npm run migration:run
```

`npm run migration:show` lists applied vs pending; `npm run migration:revert` rolls back one. Verify a change is complete by re-running `npm run typeorm -- schema:log` — it should report the schema is up to date.

> **Review generated migrations.** To change a column type TypeORM may emit `DROP COLUMN` + `ADD COLUMN`, which destroys data. Replace those with `ALTER COLUMN ... TYPE ...` by hand.

- **Production:** set `NODE_ENV=production`, then `npm run migration:run:prod` (runs from `dist/`, no ts-node needed) and `npm run db:seed:prod`.

Start the API locally:

```bash
npm run start:dev
```

## Initial admin account

Set in `.env` (see `.env.example`):

| Variable | Example |
|----------|---------|
| `ADMIN_EMAIL` | `your-admin@example.com` |
| `ADMIN_PASSWORD` | `use-a-strong-password` |

Create the admin (safe to re-run; does nothing if email already exists):

```bash
npm run db:seed
```


## Creating accounts

Two separate endpoints, on purpose:

| Endpoint | Who | Creates |
|----------|-----|---------|
| `POST /api/auth/register` | public, unauthenticated | always a `PENDING` `ATHLETE` — an admin must activate it before it can sign in |
| `POST /api/accounts` | `ADMIN` only (Bearer token) | any role, `ACTIVE` immediately |

The public route takes no role: `RegisterAccountUseCase` has no role parameter at all, so nothing reaching it can produce a privileged account. Admin account management lives on the same `/api/accounts` resource:

```
GET  /api/accounts?status=PENDING&email=mario&page=1&limit=10
POST /api/accounts/activate/:accountId
POST /api/accounts/deactivate/:accountId
```

Activation accepts `PENDING` or `INACTIVE` and returns `409` if the account is already active; deactivation also clears the stored refresh token, so an open session cannot be extended.

See [docs/README-IAM.md](docs/README-IAM.md) for the full IAM reference — flows, exception-to-status mapping, and how to protect a new endpoint. [CLAUDE.md](CLAUDE.md) is the entry point for AI assistants.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Documentation

| Need | Read |
| --- | --- |
| Project overview, rules, conventions | [CLAUDE.md](CLAUDE.md) |
| Domain, ubiquitous language, target architecture | [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) |
| IAM reference: endpoints, flows, exceptions, env vars | [docs/README-IAM.md](docs/README-IAM.md) |
| Pending data-model decisions | [docs/architecture/backend-implications.md](docs/architecture/backend-implications.md) |
| What changed and why | [docs/nestjs-auth-changelog.md](docs/nestjs-auth-changelog.md) |

## Notes

- `.env` and `keys/*.pem` are gitignored and must never be committed.
- The production container runs as the non-root `node` user (uid 1000). The mounted `keys/*.pem` files must be readable by it (on Linux, e.g. `chmod 644` on the public key and `chown 1000` on the private key).
- There is no CI yet; run `npm run build && npm run test && npm run lint` before pushing.
- Framework reference: [NestJS docs](https://docs.nestjs.com).
