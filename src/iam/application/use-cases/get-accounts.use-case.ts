import { Inject, Injectable } from '@nestjs/common';
import {
  type AccountsPage,
  type IAccountRepository,
  I_ACCOUNT_REPOSITORY,
} from '../ports/account.repository.interface';
import { AccountsQuery } from '../ports/accounts-query';

@Injectable()
export class GetAccountsUseCase {
  constructor(
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
  ) {}

  /** Always paginated: the account list has no upper bound. */
  execute(query: AccountsQuery = {}): Promise<AccountsPage> {
    return this.accountRepo.findMany(query);
  }
}
