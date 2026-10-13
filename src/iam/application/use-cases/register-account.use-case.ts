import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Account } from '../../domain/account.model';
import { AccountStatus } from '../../domain/enums/account-status.enum';
import { UserRoles } from '../../domain/enums/user-roles.enums';
import { AccountAlreadyExistsException } from '../../domain/exceptions/account-already-exists.exception';
import { normalizeEmail } from '../../domain/normalize-email';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../ports/account.repository.interface';
import {
  I_PASSWORD_HASHER,
  type IPasswordHasherPort,
} from '../ports/password-hasher.port';

/**
 * Public self-signup. There is deliberately no role field: this use case can
 * only ever produce a PENDING ATHLETE, so no request — however it is shaped,
 * and whatever a controller or guard gets wrong — can escalate through it.
 * Privileged accounts come from CreateAccountUseCase, which is admin-only.
 */
export interface RegisterAccountCommand {
  email: string;
  plainPassword: string;
}

@Injectable()
export class RegisterAccountUseCase {
  constructor(
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
    @Inject(I_PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasherPort,
  ) {}

  async execute(command: RegisterAccountCommand): Promise<Account> {
    const email = normalizeEmail(command.email);
    const existing = await this.accountRepo.findByEmail(email);
    if (existing) {
      throw new AccountAlreadyExistsException(email);
    }

    const account = new Account(
      randomUUID(),
      email,
      await this.passwordHasher.hash(command.plainPassword),
      UserRoles.ATHLETE,
      // An admin must activate the account before it can sign in.
      AccountStatus.PENDING,
    );

    await this.accountRepo.save(account);

    return account;
  }
}
