import { AccountStatus } from '../../domain/enums/account-status.enum';
import { CannotDeactivateOwnAccountException } from '../../domain/exceptions/cannot-deactivate-own-account.exception';
import { makeAccount } from '../../testing/account.fixture';
import { FakeAccountRepository } from '../../testing/fake-account.repository';
import { DeactivateAccountUseCase } from './deactivate-account.use-case';

const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const TARGET_ID = '11111111-1111-4111-8111-111111111111';

const build = () => {
  const admin = makeAccount({
    id: ADMIN_ID,
    email: 'admin@fdff.test',
    status: AccountStatus.ACTIVE,
    refreshTokenHash: 'admin-session',
  });
  const target = makeAccount({ id: TARGET_ID, status: AccountStatus.ACTIVE });
  const repo = new FakeAccountRepository([admin, target]);
  return { useCase: new DeactivateAccountUseCase(repo), repo };
};

describe('DeactivateAccountUseCase', () => {
  it('deactivates another account', async () => {
    const { useCase, repo } = build();

    await useCase.execute({ accountId: TARGET_ID, actorId: ADMIN_ID });

    expect((await repo.findById(TARGET_ID))?.status).toBe(
      AccountStatus.INACTIVE,
    );
  });

  it('refuses to let an admin deactivate their own account', async () => {
    const { useCase, repo } = build();

    await expect(
      useCase.execute({ accountId: ADMIN_ID, actorId: ADMIN_ID }),
    ).rejects.toThrow(CannotDeactivateOwnAccountException);

    // Nothing changed: still active, session intact.
    const stored = await repo.findById(ADMIN_ID);
    expect(stored?.status).toBe(AccountStatus.ACTIVE);
    expect(stored?.refreshTokenHash).toBe('admin-session');
  });

  it('reports the refusal as 409', () => {
    expect(new CannotDeactivateOwnAccountException().statusCode).toBe(409);
  });
});
