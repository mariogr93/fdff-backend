import { Account } from '../../domain/account.model';
import { AccountsQuery } from './accounts-query';

export const I_ACCOUNT_REPOSITORY = 'I_ACCOUNT_REPOSITORY';

export interface IAccountRepository {
  findById(id: string): Promise<Account | null>;
  findByEmail(email: string): Promise<Account | null>;
  findByRefreshTokenHash(hash: string): Promise<Account | null>;
  save(account: Account): Promise<void>;
  update(account: Account): Promise<void>;
  findAll(): Promise<Account[]>;
  findMany(query: AccountsQuery): Promise<Account[]>;
  activate(accountId: string): Promise<void>;
}
