# fdff-backend — Commit Plan (Auth Hardening)

Apply commits **in order** (each builds on the previous).  
**Do not commit:** `.env`, `keys/*.pem`, `dist/`

**Skip for now:** `README.md` — contains accidental local notes at the top (`psql -U db_user -d fdff_db`). Remove those lines before committing, or leave out of this series.

---

## Commit 1 — Dependencies and environment template

**Files:**
- `.gitignore`
- `.env.example`
- `package.json`
- `package-lock.json`

**Message:**
```
chore: add auth dependencies and RS256 env template

Ignore JWT PEM keys locally, document RS256 key paths and refresh-token
settings in .env.example, and add cookie-parser plus db:seed:prod script.
```

---

## Commit 2 — Database schema and persistence for refresh tokens

**Files:**
- `src/shared/database/seeds/001-initial-setup.sql`
- `src/iam/domain/account.model.ts`
- `src/iam/application/ports/account.repository.interface.ts`
- `src/iam/infrastructure/persistence/account.orm-entity.ts`
- `src/iam/infrastructure/persistence/typeorm-account.repository.ts`

**Message:**
```
feat(db): persist refresh token hash on accounts

Add refresh_token_hash to the schema and wire findByRefreshTokenHash
through the account aggregate, ORM entity, and TypeORM repository.
```

---

## Commit 3 — Security utilities (JWT RS256, refresh, cookies, bcrypt)

**Files:**
- `src/iam/infrastructure/security/jwt-key.util.ts`
- `src/iam/infrastructure/security/jwt-token.service.ts`
- `src/iam/infrastructure/security/jwt.strategy.ts`
- `src/iam/infrastructure/security/refresh-token.util.ts`
- `src/iam/infrastructure/security/auth-cookie.util.ts`
- `src/iam/infrastructure/security/bcrypt-password-hasher.ts`

**Message:**
```
feat(auth): add RS256 JWT and refresh token security utilities

Load PEM key pairs from disk, sign access tokens with RS256, generate and
hash opaque refresh tokens, and define HttpOnly cookie options for the SPA.
```

---

## Commit 4 — Login hardening, refresh rotation, and HTTP layer

**Files:**
- `src/iam/domain/exceptions/invalid-refresh-token.exception.ts`
- `src/iam/application/use-cases/login-account.use-case.ts`
- `src/iam/application/use-cases/refresh-account.use-case.ts`
- `src/iam/presentation/auth.controller.ts`
- `src/iam/iam.module.ts`
- `src/main.ts`

**Message:**
```
feat(auth): implement dual-token login and refresh rotation

Issue short-lived access JWTs in JSON and long-lived refresh tokens via
HttpOnly cookies, with lockout, timing-safe login, token rotation, and
global ValidationPipe plus CORS credentials support.
```

---

## Commit 5 — Registration password strength validation

**Files:**
- `src/shared/validators/password-strength.validator.ts`
- `src/iam/presentation/dtos/register-account.dto.ts`

**Message:**
```
feat(auth): enforce password strength on registration

Add @IsPasswordStrong validator aligned with the React signup schema and
apply it to RegisterAccountDto.
```

---

## Commit 6 — Docker Compose fixes for local and containerized API

**Files:**
- `docker-compose.yml`

**Message:**
```
fix(docker): correct API database port and mount JWT keys

Override DB_PORT to 5432 inside the api service and mount ./keys read-only
so the production image can load RS256 PEM files at runtime.
```

---

## Commit 7 — Admin seed script improvements

**Files:**
- `src/shared/database/seed-admin.ts`

**Message:**
```
fix(seed): skip admin seed when account already exists

Check for an existing admin by email before requiring ADMIN_PASSWORD so
re-runs and container restarts do not fail unnecessarily.
```

---

## Commit 8 — Auth engineering documentation

**Files:**
- `docs/README-IAM.md`
- `docs/nestjs-auth-changelog.md`
- `docs/nestjs-auth-docs.md`
- `docs/ai-auth-context.md`

**Message:**
```
docs: add NestJS auth changelog and IAM reference updates

Document dual-token flow, throttling, DTO validation, refresh rotation,
and AI assistant context for the hardened IAM module.
```

---

## Commit 9 — Security audit (optional)

**Files:**
- `DevSecOps_SecurityAudit.md`

**Message:**
```
docs(security): add cross-system authentication security audit

Record open findings and hardening priorities for the React SPA and
NestJS API integration before production launch.
```

> **Note:** Only include this commit if you want the audit published in the repo.
> For a public repository, consider keeping it in a private wiki instead.

---

## Quick reference — `git add` per commit

```bash
# 1
git add .gitignore .env.example package.json package-lock.json

# 2
git add src/shared/database/seeds/001-initial-setup.sql \
  src/iam/domain/account.model.ts \
  src/iam/application/ports/account.repository.interface.ts \
  src/iam/infrastructure/persistence/account.orm-entity.ts \
  src/iam/infrastructure/persistence/typeorm-account.repository.ts

# 3
git add src/iam/infrastructure/security/jwt-key.util.ts \
  src/iam/infrastructure/security/jwt-token.service.ts \
  src/iam/infrastructure/security/jwt.strategy.ts \
  src/iam/infrastructure/security/refresh-token.util.ts \
  src/iam/infrastructure/security/auth-cookie.util.ts \
  src/iam/infrastructure/security/bcrypt-password-hasher.ts

# 4
git add src/iam/domain/exceptions/invalid-refresh-token.exception.ts \
  src/iam/application/use-cases/login-account.use-case.ts \
  src/iam/application/use-cases/refresh-account.use-case.ts \
  src/iam/presentation/auth.controller.ts \
  src/iam/iam.module.ts \
  src/main.ts

# 5
git add src/shared/validators/password-strength.validator.ts \
  src/iam/presentation/dtos/register-account.dto.ts

# 6
git add docker-compose.yml

# 7
git add src/shared/database/seed-admin.ts

# 8
git add docs/README-IAM.md docs/nestjs-auth-changelog.md \
  docs/nestjs-auth-docs.md docs/ai-auth-context.md

# 9 (optional)
git add DevSecOps_SecurityAudit.md
```

---

## Files intentionally excluded

| File | Reason |
|------|--------|
| `.env` | Local secrets — gitignored |
| `keys/*.pem` | JWT key material — gitignored |
| `dist/` | Build output — gitignored |
| `README.md` | Accidental `psql` paste at top — fix before committing |
