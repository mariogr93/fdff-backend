# Backend implications to confirm

These came up while designing the screens and need decisions in the API and data model. Mark each one resolved (with the date and decision) or move it into an ADR once decided.

> **Status (2026-10-05):** none of these are implemented. The backend is IAM-only — no Athlete, Category, Competition, EventRegistration or Score entity exists yet, so every item below is still open. Where an item contradicts `../PROJECT_CONTEXT.md`, this file is the newer thinking but PROJECT_CONTEXT is still the agreed domain: reconcile them deliberately rather than letting code pick a side.
>
> Two items are **questions for the federation**, not engineering choices, and should be asked before the Categories and Results slices are built: whether age is computed on the competition date or by birth year (item 4), and the scoring method (item 8).
>
> Related: the frontend decisions log (`../../../fdff-front/docs/design/README.md`, D1–D11) records where these requirements came from. Note D5 says there are no payments in v1, while PROJECT_CONTEXT's `EventRegistration` still carries an unused `payment_status` field.

1. **Team and coach per registration.** Store `team_name` and `coach_name` on EventRegistration (they can change between competitions), plus `registered_by_account_id` to know whether an athlete or a coach submitted it.
2. **Cédula as national ID.** PROJECT_CONTEXT.md calls it the "Federation ID (Cédula de Competidor)". It is the Dominican national cédula: rename it in the glossary, store 11 digits, unique per athlete, and expose a lookup endpoint (`GET /athletes/by-cedula/:cedula`) that returns only name and photo to unauthenticated users.
3. **Required vs optional fields.** CompetitorProfile requires `cedula`, first name, and last name; every other field may be null. The API must reject a registration that lacks a value one of its categories depends on.
4. **Category rules.** CategoryDefinition needs `min_age`, `max_age`, `min_height`, `max_height`, and either a fixed `max_weight` or an optional height-to-weight table. Decide whether age is calculated on the competition date or by birth year.
5. **Categories per competition.** Add CompetitionCategory (`competition_id`, `category_id`, `display_order`) so each competition offers its own set and results follow that order.
6. **One row per athlete × category.** EventRegistration already supports approving one category and rejecting another. Add `rejection_reason`, `reviewed_by`, `reviewed_at`.
7. **Bulk approval endpoint.** For example `PATCH /registrations/status` with a list of IDs, returning per-item success or failure.
8. **Results and scores.** A Score entity (`registration_id`, `judge_slot`, `value`, `discarded`) and a computed placing. The scoring method (sum of placements, drop high/low) must be confirmed with the federation.
9. **Weight at registration.** Store `declared_weight` on EventRegistration and `weighed_weight` at check-in, rather than on the profile.
10. **Audit of edits.** Since any judge can edit athlete data, record who changed what and when.
11. **Personal data.** Cédulas, birthdates, and photos are personal data: Supabase buckets for athlete photos and ID documents are private (signed URLs). Confirm requirements under Dominican Law 172-13 on personal data protection.
