import { AccountStatus } from '../../domain/enums/account-status.enum';
import { AccountAlreadyActiveException } from '../../domain/exceptions/account-already-active.exception';
import { AccountNotFoundException } from '../../domain/exceptions/account-not-found.exception';
import { makeAccount } from '../../testing/account.fixture';
import { FakeAccountRepository } from '../../testing/fake-account.repository';
import { ActivateAccountUseCase } from './activate-account.use-case';

const ID = '11111111-1111-4111-8111-111111111111';

const build = (overrides: Parameters<typeof makeAccount>[0] = {}) => {
  const repo = new FakeAccountRepository([
    makeAccount({ id: ID, ...overrides }),
  ]);
  return { useCase: new ActivateAccountUseCase(repo), repo };
};

describe('ActivateAccountUseCase', () => {
  it.each([AccountStatus.PENDING, AccountStatus.INACTIVE])(
    'activates a %s account',
    async (status) => {
      const { useCase, repo } = build({ status });

      await useCase.execute({ accountId: ID });

      expect((await repo.findById(ID))?.status).toBe(AccountStatus.ACTIVE);
    },
  );

  it('rejects an account that is already active', async () => {
    const { useCase } = build({ status: AccountStatus.ACTIVE });

    await expect(useCase.execute({ accountId: ID })).rejects.toThrow(
      AccountAlreadyActiveException,
    );
  });

  it('rejects an unknown account', async () => {
    const { useCase } = build();

    await expect(
      useCase.execute({ accountId: '44444444-4444-4444-8444-444444444444' }),
    ).rejects.toThrow(AccountNotFoundException);
  });

  it('changes only the status, leaving the rest of the account alone', async () => {
    const { useCase, repo } = build({
      status: AccountStatus.PENDING,
      failedLoginAttempts: 2,
      refreshTokenHash: 'existing',
    });

    await useCase.execute({ accountId: ID });

    const stored = await repo.findById(ID);
    expect(stored?.failedLoginAttempts).toBe(2);
    expect(stored?.refreshTokenHash).toBe('existing');
  });
});
