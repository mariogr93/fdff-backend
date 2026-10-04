import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: parseInt(config.get<string>('DB_PORT', '5432'), 10),
        username: config.get<string>('DB_USER', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'postgres_password'),
        database: config.get<string>('DB_NAME', 'fdff'),
        autoLoadEntities: true,
        // Schema is owned by migrations in every environment; see data-source.ts.
        synchronize: false,
        migrations: [__dirname + '/migrations/*.{ts,js}'],
        migrationsTableName: 'migrations',
        migrationsRun: true,
      }),
    }),
  ],
})
export class DatabaseModule {}
