import { Inject, Injectable } from '@nestjs/common';
import {
  type IAccountRepository,
  I_ACCOUNT_REPOSITORY,
} from '../ports/account.repository.interface';
import { AccountNotFoundException } from '../../domain/exceptions/account-not-found.exception';

export interface ActivateAccountCommand {
  accountId: string;
}

@Injectable()
export class ActivateAccountUseCase {
  constructor(
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
  ) {}

  async execute(command: ActivateAccountCommand): Promise<void> {
    if (!command.accountId) {
      throw new Error('Account ID is required');
    }
    const account = await this.accountRepo.findById(command.accountId);
    if (!account) {
      throw new AccountNotFoundException();
    }
    await this.accountRepo.activate(account.id);
  }
}
