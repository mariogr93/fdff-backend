FDFF WebApp: Project Context & Architectural Blueprint
1. Project Overview
Name: FDFF WebApp (Federación Dominicana de Fisicoculturismo y Fitness)
Goal: A centralized platform to digitize athlete registration, event management, identity verification, and scoring for bodybuilding competitions in the Dominican Republic.
Target Audiences:

Super Users: System admins who provision judge accounts.

Judges / Officials: Manage categories, approve/reject athletes, create events, and oversee weigh-ins.

Athletes / Coaches: Register for the federation (Cédula de Competidor) and sign up for specific events.

Public / Spectators: View past event results and upcoming event details.

2. Ubiquitous Language (Domain Dictionary)
All code (variables, classes, endpoints, database schemas) must strictly use these exact terms. Do not use generic framework terms for domain concepts.

Account: A system identity with login credentials (email, password) and an RBAC role.

Athlete: A physical competitor registered to compete. (Do NOT use "User" when referring to physical traits or competition logic).

Category: The competitive branch with specific physical constraints (e.g., Men's Physique, Bikini Fitness). Do NOT use "Type" or "Division".

Sanctioned Event / Competition: An official federation show.

Check-In / Weigh-In: The physical validation process of an athlete's parameters against a category's rules.

Federation ID (Cédula de Competidor): The unique identifier used to auto-fill athlete data.

3. Technology Stack
Frontend: ReactJS + Vite + TypeScript (Admin panel and public-facing app).

Backend: NestJS (TypeScript).

Database: PostgreSQL (using TypeORM).

Storage: Supabase Buckets (for high-res physique photos, ID documents, and event galleries).

Infrastructure: Docker, Traefik (Reverse proxy/SSL), GitHub Actions (CI/CD).

4. Architectural Pattern: Tactical DDD & Vertical Slices
The NestJS backend strictly abandons the traditional layered architecture (e.g., global controllers/services folders). Instead, it uses Tactical Domain-Driven Design (DDD) combined with Vertical Slices.

Core Directives:

Feature Encapsulation: Every business capability (IAM, Athletes, Judges, Events) lives in its own independent directory.

Inward Dependency Flow: Presentation -> Application -> Domain.

Domain Purity: The domain/ directory is a black box. It contains pure business logic and invariants. It MUST NOT import from @nestjs/*, typeorm, or external APIs.

Entity Separation:

Domain Model: Pure TypeScript class with business rules.

ORM Entity: TypeORM class defining PostgreSQL tables.

DTO: Class-validator schemas for incoming HTTP requests.

5. Bounded Contexts & Database Entities
The system is divided into strict domains to separate system access from physical competition rules:

IAM (Identity & Access Management): Handles authentication.

Entity: Account (id, email, password_hash, role: ADMIN | JUDGE | ATHLETE).

Athletes Domain: Handles physical profiles.

Entity: CompetitorProfile (id, account_id (FK), cedula, height, gender, birthdate, profile_img_url).

Categories Domain: The rulebook.

Entity: CategoryDefinition (id, category_name, gender, min_height, max_weight, audited via created_by).

Competitions Domain: Event management.

Entity: Competition (id, title, event_date, venue, poster_url, gallery_urls).

Registrations Domain: The junction mapping an Athlete to a Competition for a specific Category.

Entity: EventRegistration (competition_id, athlete_id, category_id, status, payment_status).

6. NestJS Target Directory Structure
Use this exact layout for all feature scaffolding:

Plaintext
src/
├── app.module.ts              # Root module bundling all features
├── main.ts                    # Entry point (ValidationPipe configured here)
│
├── shared/                    # Cross-cutting concerns (No business logic)
│   ├── database/              # Global TypeORM config
│   ├── guards/                # Global JwtAuthGuard, RolesGuard
│   └── filters/               # Global exception handling
│
├── iam/                       # System Identity & Authentication Context
│   ├── domain/                # Account models, Role enums
│   ├── application/           # Login use-case, token generation, hashing
│   ├── infrastructure/        # JWT Strategy, Account TypeORM entity/repository
│   ├── presentation/          # AuthController (POST /auth/login, POST /auth/register)
│   └── iam.module.ts
│
└── [feature-name]/            # e.g., athletes/, categories/, competitions/
    ├── domain/                # Pure Business Rules (No frameworks)
    │   ├── [feature].model.ts # Domain Entity (e.g., athlete.model.ts)
    │   └── value-objects/     # Immutable traits (e.g., Weight, Height, Cedula)
    │
    ├── application/           # Use Cases & Coordination
    │   ├── [use-case].ts      # e.g., register-athlete.use-case.ts
    │   └── ports/             # Interfaces for Repositories
    │
    ├── infrastructure/        # Framework & Database Tooling
    │   ├── persistence/
    │   │   ├── [feature].orm-entity.ts # TypeORM Database Schema
    │   │   └── [feature].repository.ts # Implementation of DB queries
    │   └── [external-services]         # e.g., Supabase/Stripe implementations
    │
    ├── presentation/          # API Delivery
    │   ├── [feature].controller.ts     # NestJS Endpoints
    │   └── dtos/                       # Request Validation (class-validator)
    │
    └── [feature].module.ts    # NestJS Dependency Injection wiring
7. Key Workflows to Implement
Registration Saga (IAM + Athlete): When a new athlete registers, the IAM module creates the Account and hashes the password. The Athletes module then takes the newly created account_id and creates the physical CompetitorProfile.

Role-Based Routing: POST /auth/login returns a JWT containing the Account ID and Role. The frontend routes users based on this role, and the backend protects endpoints using @Roles('JUDGE', 'ADMIN').

Dynamic Category Filtering: When signing up for an event, the system must only present categories that match the athlete's registered gender, age, height, and weight.

Judge Dashboard: List pending event registrations -> Approve/Deny based on check-in verification -> Update status in the database.