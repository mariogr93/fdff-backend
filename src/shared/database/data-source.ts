import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/validate-env';

loadEnv();
validateEnv(process.env);

/**
 * Used by the TypeORM CLI only (migration:generate / run / revert). The running
 * app configures its own connection in database.module.ts; both must agree.
 *
 * Entities and migrations are globbed relative to this file so the same source
 * works from src/ under ts-node and from dist/ in production.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [__dirname + '/../../**/*.orm-entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  migrationsTableName: 'migrations',
  synchronize: false,
});
