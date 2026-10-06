import { Inject, Injectable } from '@nestjs/common';
import { AccountNotFoundException } from '../../domain/exceptions/account-not-found.exception';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../ports/account.repository.interface';

export interface DeactivateAccountCommand {
  accountId: string;
}

@Injectable()
export class DeactivateAccountUseCase {
  constructor(
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
  ) {}

  /**
   * Rules that need more than the account itself — "you cannot deactivate
   * yourself" or "the last ADMIN must remain" — belong here rather than in the
   * entity, since they require the acting user or a repository count. Neither
   * is enforced yet.
   */
  async execute(command: DeactivateAccountCommand): Promise<void> {
    const account = await this.accountRepo.findById(command.accountId);

    if (!account) {
      throw new AccountNotFoundException();
    }

    await this.accountRepo.update(account.deactivate());
  }
}
