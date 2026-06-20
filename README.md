
psql -U db_user -d fdff_db



## Description

Backend API for the FDFF WebApp (Federación Dominicana de Fisicoculturismo y Fitness).

## Database setup

PostgreSQL runs via Docker Compose:

```bash
docker compose up -d db
```

Copy `.env.example` to `.env` and adjust `DB_*` values if needed (defaults match `docker-compose.yml`).

- **Schema (SQL):** [src/shared/database/seeds/001-initial-setup.sql](src/shared/database/seeds/001-initial-setup.sql) — enums + `accounts` table only.
- **Initial admin (TypeScript):** [src/shared/database/seed-admin.ts](src/shared/database/seed-admin.ts) — reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`, hashes with bcrypt, inserts via `TypeOrmAccountRepository`. Skips if the email already exists (never overwrites passwords).

**Reset database from scratch:**

```bash
docker compose down -v
docker compose up -d --build
npm run db:seed
```

On first start, Postgres runs the SQL schema automatically. Then run `npm run db:seed` to create the admin (requires `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`).

Re-apply schema only on an existing database: `npm run db:schema`

- **Development:** TypeORM `synchronize` is also enabled when `NODE_ENV` is not `production`.
- **Production:** Set `NODE_ENV=production`, apply schema SQL, then `npm run db:seed`.

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


Public registration still creates `ATHLETE` accounts only. Use the admin `accessToken` to create `ADMIN` or `JUDGE` accounts via `POST /auth/register`.

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

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
