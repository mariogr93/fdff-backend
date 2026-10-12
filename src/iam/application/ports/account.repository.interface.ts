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
  /**
   * Inserts a NEW account. Throws AccountAlreadyExistsException when the email
   * is taken, including when two requests race past a findByEmail check.
   */
  save(account: Account): Promise<void>;
  update(account: Account): Promise<void>;
  /**
   * Writes only if the stored refresh hash still equals `expectedHash`, and
   * says whether it did. Guards a read-then-write against a concurrent writer
   * (optimistic locking); the domain still decides the new state.
   */
  updateIfRefreshTokenHashIs(
    account: Account,
    expectedHash: string,
  ): Promise<boolean>;
  findMany(query: AccountsQuery): Promise<AccountsPage>;
}
