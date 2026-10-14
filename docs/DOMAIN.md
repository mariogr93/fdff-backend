# Domain

| Term | Meaning |
| --- | --- |
| Account | Login identity (email, password hash) with a role: ADMIN, JUDGE, ATHLETE |
| Athlete / CompetitorProfile | A physical competitor: cédula, names, gender, birthdate, height, photo |
| Cédula | Dominican national ID: 11 digits, stored without hyphens, unique per athlete |
| Category / CategoryDefinition | Competitive branch with rules on gender, age, height and weight |
| Competition | An official federation show (sanctioned event) |
| EventRegistration | One athlete × one category × one competition, with its own status |
| Weigh-In / Check-In | Physical validation of an athlete against a category's rules |

Naming: never `User` for physical or competition data; never `Type` or `Division` for Category.

## Lifecycles

- `Account.status` is `PENDING | ACTIVE | INACTIVE`. An admin activates an account so a person can sign in.
- `EventRegistration.status` will be `PENDING | APPROVED | REJECTED`. A judge approves a registration so an athlete can compete.
- There is no `APPROVED` or `REJECTED` account status and no `AccountNotApprovedException`. Deactivating a `PENDING` account expresses a rejection at the account level.

## Business rules

- An athlete can register in several categories of one competition; each EventRegistration is approved or rejected independently.
- A registration is valid only for categories whose gender, age, height and weight rules the athlete meets.
- Required athlete data: cédula, first name, last name, plus every attribute the chosen categories depend on. Reject a registration missing one.
- Athletes register themselves or through a coach; each registration records team name, coach name, and who submitted it.
- ADMIN creates judge accounts. ADMIN and JUDGE create competitions and categories, approve or reject registrations (individually or in bulk), and edit athlete data. All edits are audited.
- Bulk operations return per-item success or failure, never all-or-nothing silently.

Pending decisions: `docs/architecture/backend-implications.md`.
