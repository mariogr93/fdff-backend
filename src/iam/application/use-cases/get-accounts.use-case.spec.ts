import { AccountStatus } from '../../domain/enums/account-status.enum';
import { makeAccount } from '../../testing/account.fixture';
import { FakeAccountRepository } from '../../testing/fake-account.repository';
import { GetAccountsUseCase } from './get-accounts.use-case';

describe('GetAccountsUseCase', () => {
  it('returns every account the repository holds', async () => {
    const repo = new FakeAccountRepository([
      makeAccount({ id: 'a', email: 'one@fdff.test' }),
      makeAccount({
        id: 'b',
        email: 'two@fdff.test',
        status: AccountStatus.PENDING,
      }),
    ]);

    const accounts = await new GetAccountsUseCase(repo).execute();

    expect(accounts.map((a) => a.email)).toEqual([
      'one@fdff.test',
      'two@fdff.test',
    ]);
  });

  it('returns an empty list when there are no accounts', async () => {
    const accounts = await new GetAccountsUseCase(
      new FakeAccountRepository(),
    ).execute();

    expect(accounts).toEqual([]);
  });
});
