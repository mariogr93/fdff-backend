import { AccountStatus } from '../../domain/enums/account-status.enum';
import { UserRoles } from '../../domain/enums/user-roles.enums';
import { makeAccount } from '../../testing/account.fixture';
import { FakeAccountRepository } from '../../testing/fake-account.repository';
import { GetAccountsUseCase } from './get-accounts.use-case';

const seeded = () =>
  new FakeAccountRepository([
    makeAccount({ id: 'a', email: 'one@fdff.test' }),
    makeAccount({
      id: 'b',
      email: 'two@fdff.test',
      status: AccountStatus.PENDING,
    }),
    makeAccount({ id: 'c', email: 'three@fdff.test', role: UserRoles.JUDGE }),
  ]);

describe('GetAccountsUseCase', () => {
  it('returns the page and the unpaged total', async () => {
    const page = await new GetAccountsUseCase(seeded()).execute();

    expect(page.total).toBe(3);
    expect(page.rows.map((a) => a.email)).toEqual([
      'one@fdff.test',
      'two@fdff.test',
      'three@fdff.test',
    ]);
  });

  it('passes filters through to the repository', async () => {
    const page = await new GetAccountsUseCase(seeded()).execute({
      role: UserRoles.JUDGE,
    });

    expect(page.total).toBe(1);
    expect(page.rows[0].email).toBe('three@fdff.test');
  });

  it('limits the page while still reporting the full total', async () => {
    const page = await new GetAccountsUseCase(seeded()).execute({
      page: 1,
      limit: 2,
    });

    expect(page.rows).toHaveLength(2);
    expect(page.total).toBe(3);
  });

  it('returns an empty page when there are no accounts', async () => {
    const page = await new GetAccountsUseCase(
      new FakeAccountRepository(),
    ).execute();

    expect(page).toEqual({ rows: [], total: 0 });
  });
});
