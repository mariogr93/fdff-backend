# Known gaps

- No OpenAPI spec: `@nestjs/swagger` is not installed, so API types in `fdff-front/src/types/` are hand-written.
- No CI: there is no `.github/`, so nothing runs build, test or lint automatically.
- No Traefik or Supabase yet, although `PROJECT_CONTEXT.md` lists them as target infrastructure.
- The login throttle (5/min) is tighter than the lockout threshold (5 attempts), so from one IP the throttler fires first. Lockout still matters for distributed attempts.
- Security review documents are kept local and untracked; ask the maintainer for the current status.
- `docs/nestjs-auth-changelog.md` is history, not a maintained reference.
