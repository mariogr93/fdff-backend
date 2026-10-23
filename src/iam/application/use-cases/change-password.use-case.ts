import { Inject, Injectable } from '@nestjs/common';
import { AccountNotFoundException } from '../../domain/exceptions/account-not-found.exception';
import { CurrentPasswordIncorrectException } from '../../domain/exceptions/current-password-incorrect.exception';
import { NewPasswordUnchangedException } from '../../domain/exceptions/new-password-unchanged.exception';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../ports/account.repository.interface';
import {
  I_PASSWORD_HASHER,
  type IPasswordHasherPort,
} from '../ports/password-hasher.port';

export interface IChangePasswordCommand {
  accountId: string;
  currentPlainPassword: string;
  newPlainPassword: string;
}

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
    @Inject(I_PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasherPort,
  ) {}

  /**
   * Ends every session of the account, this one included: the caller signs in
   * again with the new password. No session is opened here, so no token or
   * cookie code is needed.
   */
  async execute(command: IChangePasswordCommand): Promise<void> {
    const account = await this.accountRepo.findById(command.accountId);
    if (!account) {
      throw new AccountNotFoundException();
    }

    const isCurrentValid = await this.passwordHasher.compare(
      command.currentPlainPassword,
      account.passwordHash,
    );
    if (!isCurrentValid) {
      throw new CurrentPasswordIncorrectException();
    }

    // The current password is proven by now, so comparing the two plain
    // strings is enough to catch an unchanged password.
    if (command.newPlainPassword === command.currentPlainPassword) {
      throw new NewPasswordUnchangedException();
    }

    await this.accountRepo.update(
      account.changePassword(
        await this.passwordHasher.hash(command.newPlainPassword),
      ),
    );
  }
}
