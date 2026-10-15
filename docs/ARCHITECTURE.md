# Architecture

Tactical DDD with vertical slices. No global `controllers/` or `services/` folders. Dependencies point inward: `presentation → application → domain`, with `infrastructure` implementing the application's ports.

```
src/
├── main.ts              # thin: delegates to configure-app.ts
├── configure-app.ts     # JSON-only bodies, cookie parser, /api prefix, CORS allowlist,
│                        #   helmet, ValidationPipe, DomainExceptionFilter; shared with e2e tests
├── app.module.ts        # global ThrottlerGuard (100 req/min)
├── scripts/             # composition roots: seed-admin.ts
├── shared/              # cross-cutting, depends on no slice
│   ├── config/          # validate-env.ts, allowed-origins.ts
│   ├── domain/          # DomainException, the one base class
│   ├── database/        # data-source.ts (CLI), database.module.ts, migrations/
│   ├── filters/         # DomainExceptionFilter
│   ├── http/            # require-json-body middleware, setup-openapi.ts (Swagger, not in production)
│   └── validators/      # @IsPasswordStrong
└── iam/
    ├── domain/          # account.model.ts, normalize-email.ts, enums/, exceptions/
    ├── application/     # ports/, use-cases/
    ├── infrastructure/  # persistence/, security/
    ├── presentation/    # controllers, dtos/, guards/
    ├── testing/         # makeAccount, FakeAccountRepository, FakeRefreshTokenService
    └── iam.module.ts
```

## Boundaries

- `application/` depends on ports, never on TypeORM. Ports are `Symbol` or string DI tokens in `application/ports/`.
- Ports must not import from `presentation/`. The accounts filter shape lives in `application/ports/accounts-query.ts`; the DTO maps HTTP onto it.
- Slices talk through use cases or exported ports, never through another slice's ORM entity.
- Authorization belongs to IAM: `JwtAuthGuard` and `RolesGuard` live in `iam/presentation/guards/` and are exported by `IamModule`. A slice that guards a route must import `IamModule`, because `JwtAuthGuard` resolves the `'jwt'` strategy registered there.

## Three models per concept

| Model | Location | Purpose |
| --- | --- | --- |
| Domain model | `domain/<feature>.model.ts` | Business rules and invariants |
| ORM entity | `infrastructure/persistence/<feature>.orm-entity.ts` | Table mapping |
| DTO | `presentation/dtos/` | HTTP input validation, and response classes (`*-response.dto.ts`) that the OpenAPI spec describes |

Map between them explicitly. Controllers project to plain objects, which keeps hashes out of responses.

## Conventions

- File names: `register-athlete.use-case.ts`, `athlete.model.ts`, `athlete.orm-entity.ts`, `athletes.controller.ts`.
- Domain errors extend `DomainException` with their HTTP status; `DomainExceptionFilter` maps them. `@Catch()` matches on class identity, so a duplicate base class turns every domain error into a 500 with a leaked stack.
- Error messages are English prose. The frontend does not read them; it shows its own Spanish copy. Stable error codes are not implemented on either side and are a cross-repo decision.

## Testing

- Run tests with `npm test` and `npm run test:e2e`, never `jest` directly: the scripts pass the Node flag Jest needs to load the ESM-only NestJS 12 packages.
- Unit-test domain models with no Nest and no database (`src/iam/domain/account.model.spec.ts`).
- Use-case tests use the in-memory fakes in `src/iam/testing/`. `makeAccount(overrides)` is the only place tests construct an `Account`.
- Controller tests build a testing module, stub the guards, and wrap it in `configureApp`, so asserted status codes match what a client receives (`account.controller.spec.ts`).
- The global `ThrottlerGuard` is registered in `AppModule`; only tests that import `AppModule` need `ThrottlerModule` or a guard override.
