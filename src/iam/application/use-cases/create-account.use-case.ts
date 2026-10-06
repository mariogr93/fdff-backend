import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Account } from '../../domain/account.model';
import { AccountStatus } from '../../domain/enums/account-status.enum';
import { UserRoles } from '../../domain/enums/user-roles.enums';
import { AccountAlreadyExistsException } from '../../domain/exceptions/account-already-exists.exception';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../ports/account.repository.interface';
import {
  I_PASSWORD_HASHER,
  type IPasswordHasherPort,
} from '../ports/password-hasher.port';

/**
 * Admin-provisioned accounts — judges, other admins, or an athlete entered on
 * someone's behalf. Only reachable behind JwtAuthGuard + @Roles(ADMIN); the
 * role is explicit here, unlike public self-signup.
 */
export interface CreateAccountCommand {
  email: string;
  plainPassword: string;
  role: UserRoles;
}

@Injectable()
export class CreateAccountUseCase {
  constructor(
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
    @Inject(I_PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasherPort,
  ) {}

  async execute(command: CreateAccountCommand): Promise<Account> {
    const existing = await this.accountRepo.findByEmail(command.email);
    if (existing) {
      throw new AccountAlreadyExistsException(command.email);
    }

    const account = new Account(
      randomUUID(),
      command.email,
      await this.passwordHasher.hash(command.plainPassword),
      command.role,
      // ACTIVE immediately: an admin creating an account *is* the approval, and
      // the temporary password is handed over expecting it to work.
      AccountStatus.ACTIVE,
    );

    await this.accountRepo.save(account);

    return account;
  }
}
