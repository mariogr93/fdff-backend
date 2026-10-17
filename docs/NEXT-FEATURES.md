# Next features

Planned work that hardens or extends the API. Delete an entry in the change that ships it.
Frontend counterpart: `../fdff-front/docs/NEXT-FEATURES.md`.

## Features

### Continuous integration
GitHub Actions runs build, lint without `--fix`, unit and e2e tests and `npm audit --omit=dev` on every push and pull request; Dependabot opens weekly updates.
**Improves:** regressions and vulnerable dependencies are caught before they reach `main`.

### Email verification on signup
Signup sends a confirmation link and answers the same way for every address; the account is created once the link is used. Hash the password on every path so response time is uniform.
**Improves:** registered emails stay private, and only reachable addresses get accounts. Details: `architecture/backend-implications.md` item 12.

### Bot protection on signup
A CAPTCHA on `POST /auth/register` before public launch.
**Improves:** blocks automated signups beyond the per-IP limit.

### Reverse proxy with HTTPS (Traefik)
Traefik terminates TLS and serves one public origin for the SPA and `/api`; the API port is no longer published on `0.0.0.0`. Set Express `trust proxy` to the proxy hop count (nginx behind Traefik is 2).
**Improves:** encrypted traffic, the `Secure` refresh cookie works in production, and rate limits apply per client instead of per proxy.

### Shared rate-limit store (Redis)
Move throttler counters from memory to Redis.
**Improves:** limits hold when more than one API instance runs.

### File uploads (Supabase storage)
A dedicated multipart route, exempt from the JSON-only rule, storing files in Supabase.
**Improves:** athletes can attach documents and photos.

## Design decisions

Deliberate choices. Revisit one when its trigger happens.

| Decision | Revisit when |
| --- | --- |
| Refresh cookie is `SameSite=Strict` | SPA and API move to different registrable domains (prefer one origin behind the proxy) |
| Access token travels in the JSON body and lives in memory only | Never alone: it relies on the SPA's CSP and on keeping the token out of React context |
| One session per account: a new login replaces the refresh token | Users need several devices signed in at once |
| Login throttle (5/min per IP) fires before the 5-attempt lockout from a single IP | Lockout still covers distributed attempts; revisit with the Redis store |
