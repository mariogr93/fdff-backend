import { Inject, Injectable } from '@nestjs/common';
import { CannotDeactivateOwnAccountException } from '../../domain/exceptions/cannot-deactivate-own-account.exception';
import { AccountNotFoundException } from '../../domain/exceptions/account-not-found.exception';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../ports/account.repository.interface';

export interface DeactivateAccountCommand {
  accountId: string;
  /** The signed-in admin performing the action. */
  actorId: string;
}

@Injectable()
export class DeactivateAccountUseCase {
  constructor(
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
  ) {}

  /**
   * Rules that need more than the account itself belong here rather than in
   * the entity, since they require the acting user or a repository count.
   * "You cannot deactivate yourself" is enforced. "The last ADMIN must remain"
   * is not: two admins deactivating each other at the same instant could still
   * leave none, and closing that needs a transaction.
   */
  async execute(command: DeactivateAccountCommand): Promise<void> {
    if (command.actorId === command.accountId) {
      throw new CannotDeactivateOwnAccountException();
    }

    const account = await this.accountRepo.findById(command.accountId);

    if (!account) {
      throw new AccountNotFoundException();
    }

    await this.accountRepo.update(account.deactivate());
  }
}
