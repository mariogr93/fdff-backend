# fdff-backend

API of the FDFF WebApp (Federación Dominicana de Fisicoculturismo y Fitness): athlete registration, competitions, categories, registration approvals and results. The React client is the separate `fdff-front` repository.

Only the IAM slice exists (accounts, authentication, admin account management). Everything else is specified in `docs/PROJECT_CONTEXT.md` but not built: treat that file as a spec, not as a description of the code.

## Commands

```bash
docker compose up -d db                          # Postgres, bound to 127.0.0.1
npm run start:dev
npm run build && npm run test && npm run lint    # must pass before a task is done
npm run test:e2e                                 # needs the live DB and keys/*.pem
npm run migration:generate -- src/shared/database/migrations/<Name>
npm run migration:run
```

`npm run lint` rewrites files. Review the diff after running it.

## Rules

1. Use the domain terms exactly (`docs/DOMAIN.md`). Never `User` for athlete or competition data; never `Type` or `Division` for Category.
2. Dependencies point inward: `presentation → application → domain`. `infrastructure/` implements the ports in `application/ports/`. Use cases depend on ports only, never on TypeORM or `infrastructure/`.
3. Nothing under `domain/` imports `@nestjs/*`, `typeorm`, `class-validator` or any SDK, and domain code never reads configuration.
4. Business rules live in the domain, never in controllers or repositories.
5. `src/shared/` imports from no slice. Cross-cutting code that needs a slice goes in `src/scripts/`.
6. Deny by default: every non-public route has `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles(...)`, preferably at class level.
7. Every schema change is a migration (`synchronize` is false). Read the generated SQL before running it, and replace `DROP COLUMN` + `ADD COLUMN` with `ALTER COLUMN ... TYPE`.
8. Never log secrets or personal data: no tokens, token hashes, cédulas or birthdates. Controllers return plain projections, never ORM entities.
9. Never commit secrets. Add new variables to `.env.example` and to `src/shared/config/validate-env.ts`.
10. Keep exactly one `DomainException` class (`src/shared/domain/`). A second copy turns every domain error into a 500.
11. Use relative imports only. `src/...` paths break the tests.
12. Tests construct an `Account` only through `makeAccount()` in `src/iam/testing/`.

## Two lifecycles that are easy to confuse

- `Account.status` is `PENDING | ACTIVE | INACTIVE`. An admin activates an account so a person can sign in. Deactivating a `PENDING` account is how a signup is rejected; there is no `APPROVED` or `REJECTED` account status.
- `EventRegistration.status` (not built) will be `PENDING | APPROVED | REJECTED`. A judge approves a registration so an athlete can compete.

## How to work

- Plan first when a change touches more than one file. Keep one slice per change.
- The code wins over the docs. Verify against a test or the running API, then fix the doc in the same change.
- Ask when a business rule is ambiguous, and record the answer in `docs/architecture/backend-implications.md`. Read that file before changing entities.
- Do not invent endpoints. Propose a package before adding it (`@supabase/supabase-js` is not installed).
- The OpenAPI spec is served at `/api/docs` (UI) and `/api/docs-json` outside production. Document new routes with `@nestjs/swagger` decorators in `presentation/` only, and return a `*.dto.ts` response class so the build plugin can describe it.
- Run tests with `npm test` / `npm run test:e2e`, never `jest` directly: NestJS 12 is ESM-only and the scripts add the Node flag Jest needs.

## Read more

| Need | Read |
| --- | --- |
| Glossary and business rules | `docs/DOMAIN.md` |
| Folder layout, models, conventions, testing | `docs/ARCHITECTURE.md` |
| Known gaps | `docs/KNOWN-GAPS.md` |
| IAM endpoints, flows, env vars | `docs/README-IAM.md` |
| Target domain and infrastructure | `docs/PROJECT_CONTEXT.md` |
| Database setup and migrations | `README.md` |
| Frontend contract, Spanish copy | `../fdff-front/CLAUDE.md` |
| Federation decisions log (D1–D11) | `../fdff-front/docs/design/README.md` |
