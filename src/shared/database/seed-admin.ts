import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AppModule } from '../../app.module';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../../iam/application/ports/account.repository.interface';
import {
  I_PASSWORD_HASHER,
  type IPasswordHasherPort,
} from '../../iam/application/ports/password-hasher.port';
import { Account } from '../../iam/domain/account.model';
import { AccountStatus } from '../../iam/domain/enums/account-status.enum';
import { UserRoles } from '../../iam/domain/enums/user-roles.enums';

async function seedAdmin(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const config = app.get(ConfigService);
    const adminEmail = config.get<string>('ADMIN_EMAIL')?.trim();
    const adminPassword = config.get<string>('ADMIN_PASSWORD')?.trim();

    const accountRepo = app.get<IAccountRepository>(I_ACCOUNT_REPOSITORY);
    const passwordHasher = app.get<IPasswordHasherPort>(I_PASSWORD_HASHER);

    if (adminEmail) {
      const existing = await accountRepo.findByEmail(adminEmail);
      if (existing) {
        console.log(
          `Admin account "${adminEmail}" already exists. Skipping seed (no changes made).`,
        );
        return;
      }
    }

    if (!adminEmail || !adminPassword) {
      console.error(
        'Missing required environment variables: ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env',
      );
      process.exit(1);
    }

    const passwordHash = await passwordHasher.hash(adminPassword);
    const admin = new Account(
      randomUUID(),
      adminEmail,
      passwordHash,
      UserRoles.ADMIN,
      AccountStatus.APPROVED,
    );

    await accountRepo.save(admin);
    console.log(`Admin account created: ${adminEmail}`);
  } finally {
    await app.close();
  }
}

seedAdmin().catch((error) => {
  console.error('Admin seed failed:', error);
  process.exit(1);
});
