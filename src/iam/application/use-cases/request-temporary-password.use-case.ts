import { Inject, Injectable, Logger } from '@nestjs/common';
import { normalizeEmail } from '../../domain/normalize-email';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../ports/account.repository.interface';
import { I_MAILER, type IMailerPort } from '../ports/mailer.port';
import {
  I_PASSWORD_HASHER,
  type IPasswordHasherPort,
} from '../ports/password-hasher.port';
import {
  I_TEMPORARY_PASSWORD_GENERATOR,
  type ITemporaryPasswordGeneratorPort,
} from '../ports/temporary-password-generator.port';

/** A temporary password requested by its owner (forgot password) lasts one hour. */
export const FORGOT_PASSWORD_TTL_MS = 60 * 60 * 1000;

export interface RequestTemporaryPasswordCommand {
  email: string;
}

/**
 * Forgot password. Emails a one-time temporary password to an ACTIVE account;
 * the real password keeps working, so a stranger asking cannot lock the owner
 * out. The caller always gets the same answer, whatever the address.
 */
@Injectable()
export class RequestTemporaryPasswordUseCase {
  private readonly logger = new Logger(RequestTemporaryPasswordUseCase.name);

  constructor(
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
    @Inject(I_PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasherPort,
    @Inject(I_TEMPORARY_PASSWORD_GENERATOR)
    private readonly generator: ITemporaryPasswordGeneratorPort,
    @Inject(I_MAILER)
    private readonly mailer: IMailerPort,
  ) {}

  async execute(command: RequestTemporaryPasswordCommand): Promise<void> {
    const now = new Date();
    const account = await this.accountRepo.findByEmail(
      normalizeEmail(command.email),
    );

    // Generated and hashed on every path, so response time does not reveal
    // whether the address belongs to an active account.
    const temporaryPassword = this.generator.generate();
    const hash = await this.passwordHasher.hash(temporaryPassword);

    if (!account || !account.isActive()) {
      return;
    }

    const expiresAt = new Date(now.getTime() + FORGOT_PASSWORD_TTL_MS);
    await this.accountRepo.update(
      account.withTemporaryPassword(hash, expiresAt),
    );

    // Not awaited: a slow or failing mail server must not change the answer or
    // its timing. The log names the account id only, never the address or the
    // password.
    void this.mailer
      .sendTemporaryPassword({
        to: account.email,
        temporaryPassword,
        expiresAt,
      })
      .catch(() =>
        this.logger.warn(
          `Temporary password mail failed for account ${account.id}.`,
        ),
      );
  }
}
