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

  findById(id: string): Promise<Account | null> {
    return Promise.resolve(this.accounts.get(id) ?? null);
  }

  findByEmail(email: string): Promise<Account | null> {
    return Promise.resolve(this.list().find((a) => a.email === email) ?? null);
  }

  findByRefreshTokenHash(hash: string): Promise<Account | null> {
    return Promise.resolve(
      this.list().find((a) => a.refreshTokenHash === hash) ?? null,
    );
  }

  save(account: Account): Promise<void> {
    this.accounts.set(account.id, account);
    return Promise.resolve();
  }

  update(account: Account): Promise<void> {
    this.accounts.set(account.id, account);
    return Promise.resolve();
  }

  findAll(): Promise<Account[]> {
    return Promise.resolve(this.list());
  }

  findMany(query: AccountsQuery): Promise<Account[]> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;

    const matches = this.list().filter((account) => {
      if (query.email && !account.email.includes(query.email)) return false;
      if (query.role && account.role !== query.role) return false;
      if (query.status && account.status !== query.status) return false;
      return true;
    });

    return Promise.resolve(matches.slice(offset, offset + limit));
  }

  activate(accountId: string): Promise<void> {
    const account = this.accounts.get(accountId);
    if (account) {
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
    return Promise.resolve();
  }

  private list(): Account[] {
    return [...this.accounts.values()];
  }
}
