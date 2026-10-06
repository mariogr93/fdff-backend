import { Account } from '../../domain/account.model';
import { AccountsQuery } from './accounts-query';

export const I_ACCOUNT_REPOSITORY = 'I_ACCOUNT_REPOSITORY';

export interface AccountsPage {
  rows: Account[];
  /** Total matching the filters, ignoring page and limit. */
  total: number;
}

export interface IAccountRepository {
  findById(id: string): Promise<Account | null>;
  findByEmail(email: string): Promise<Account | null>;
  findByRefreshTokenHash(hash: string): Promise<Account | null>;
  save(account: Account): Promise<void>;
  update(account: Account): Promise<void>;
  findMany(query: AccountsQuery): Promise<AccountsPage>;
}
