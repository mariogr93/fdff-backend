import { IAccountRepository } from '../application/ports/account.repository.interface';
import { AccountsQuery } from '../application/ports/accounts-query';
import { Account } from '../domain/account.model';
import { AccountStatus } from '../domain/enums/account-status.enum';

/**
 * In-memory IAccountRepository for use-case tests. Insertion-ordered: findMany
 * cannot honour sortOrder because the domain Account carries no createdAt.
 */
export class FakeAccountRepository implements IAccountRepository {
  private readonly accounts = new Map<string, Account>();

  constructor(seed: Account[] = []) {
    for (const account of seed) {
      this.accounts.set(account.id, account);
    }
  }

  async findById(id: string): Promise<Account | null> {
    return this.accounts.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<Account | null> {
    return (
      [...this.accounts.values()].find((a) => a.email === email) ?? null
    );
  }

  async findByRefreshTokenHash(hash: string): Promise<Account | null> {
    return (
      [...this.accounts.values()].find((a) => a.refreshTokenHash === hash) ??
      null
    );
  }

  async save(account: Account): Promise<void> {
    this.accounts.set(account.id, account);
  }

  async update(account: Account): Promise<void> {
    this.accounts.set(account.id, account);
  }

  async findAll(): Promise<Account[]> {
    return [...this.accounts.values()];
  }

  async findMany(query: AccountsQuery): Promise<Account[]> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const matches = [...this.accounts.values()].filter((account) => {
      if (query.email && !account.email.includes(query.email)) return false;
      if (query.role && account.role !== query.role) return false;
      if (query.status && account.status !== query.status) return false;
      return true;
    });

    return matches.slice((page - 1) * limit, (page - 1) * limit + limit);
  }

  async activate(accountId: string): Promise<void> {
    const account = this.accounts.get(accountId);
    if (!account) {
      return;
    }
    this.accounts.set(
      accountId,
      new Account(
        account.id,
        account.email,
        account.passwordHash,
        account.role,
        AccountStatus.ACTIVE,
        account.failedLoginAttempts,
        account.lockedUntil,
        account.refreshTokenHash,
      ),
    );
  }
}
