import { AccountStatus } from '../../domain/enums/account-status.enum';
import { UserRoles } from '../../domain/enums/user-roles.enums';
import { LastAdminException } from '../../domain/exceptions/last-admin.exception';
import { AccountAlreadyInactiveException } from '../../domain/exceptions/account-already-inactive.exception';
import { AccountNotFoundException } from '../../domain/exceptions/account-not-found.exception';
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

  it('also drops the refresh token, so an open session cannot be extended', async () => {
    const live = makeAccount({
      id: TARGET_ID,
      status: AccountStatus.ACTIVE,
      refreshTokenHash: 'live-session',
      refreshTokenExpiresAt: new Date(Date.now() + 60_000),
      previousRefreshTokenHash: 'older-session',
    });
    const repo = new FakeAccountRepository([live]);

    await new DeactivateAccountUseCase(repo).execute({
      accountId: TARGET_ID,
      actorId: ADMIN_ID,
    });

    const stored = await repo.findById(TARGET_ID);
    expect(stored?.refreshTokenHash).toBeNull();
    expect(stored?.refreshTokenExpiresAt).toBeNull();
    expect(stored?.previousRefreshTokenHash).toBeNull();
  });

  it('revokes the access tokens already issued to the account', async () => {
    const { useCase, repo } = build();

    await useCase.execute({ accountId: TARGET_ID, actorId: ADMIN_ID });

    expect((await repo.findById(TARGET_ID))?.tokenVersion).toBe(1);
  });

  it('rejects a registration by deactivating a PENDING account', async () => {
    const repo = new FakeAccountRepository([
      makeAccount({ id: TARGET_ID, status: AccountStatus.PENDING }),
    ]);

    await new DeactivateAccountUseCase(repo).execute({
      accountId: TARGET_ID,
      actorId: ADMIN_ID,
    });

    expect((await repo.findById(TARGET_ID))?.status).toBe(
      AccountStatus.INACTIVE,
    );
  });

  it('rejects an account that is already inactive', async () => {
    const repo = new FakeAccountRepository([
      makeAccount({ id: TARGET_ID, status: AccountStatus.INACTIVE }),
    ]);

    await expect(
      new DeactivateAccountUseCase(repo).execute({
        accountId: TARGET_ID,
        actorId: ADMIN_ID,
      }),
    ).rejects.toThrow(AccountAlreadyInactiveException);
  });

  it('rejects an unknown account', async () => {
    const { useCase } = build();

    await expect(
      useCase.execute({
        accountId: '44444444-4444-4444-8444-444444444444',
        actorId: ADMIN_ID,
      }),
    ).rejects.toThrow(AccountNotFoundException);
  });

  it('reports the refusal as 409', () => {
    expect(new CannotDeactivateOwnAccountException().statusCode).toBe(409);
  });

  describe('the last active admin must remain', () => {
    const OTHER_ADMIN_ID = '55555555-5555-4555-8555-555555555555';
    const admin = (id: string, email: string, status = AccountStatus.ACTIVE) =>
      makeAccount({ id, email, role: UserRoles.ADMIN, status });

    it('refuses to deactivate the only active admin', async () => {
      const repo = new FakeAccountRepository([
        admin(TARGET_ID, 'only@fdff.test'),
        makeAccount({ id: ADMIN_ID, role: UserRoles.JUDGE, email: 'j@x.test' }),
      ]);

      await expect(
        new DeactivateAccountUseCase(repo).execute({
          accountId: TARGET_ID,
          actorId: ADMIN_ID,
        }),
      ).rejects.toThrow(LastAdminException);
      expect((await repo.findById(TARGET_ID))?.status).toBe(
        AccountStatus.ACTIVE,
      );
    });

    it('allows deactivating an admin while another stays active', async () => {
      const repo = new FakeAccountRepository([
        admin(TARGET_ID, 'a@fdff.test'),
        admin(OTHER_ADMIN_ID, 'b@fdff.test'),
      ]);

      await new DeactivateAccountUseCase(repo).execute({
        accountId: TARGET_ID,
        actorId: OTHER_ADMIN_ID,
      });

      expect((await repo.findById(TARGET_ID))?.status).toBe(
        AccountStatus.INACTIVE,
      );
      expect((await repo.findById(OTHER_ADMIN_ID))?.status).toBe(
        AccountStatus.ACTIVE,
      );
    });

    it('does not count an inactive admin as one that remains', async () => {
      const repo = new FakeAccountRepository([
        admin(TARGET_ID, 'a@fdff.test'),
        admin(OTHER_ADMIN_ID, 'b@fdff.test', AccountStatus.INACTIVE),
      ]);

      await expect(
        new DeactivateAccountUseCase(repo).execute({
          accountId: TARGET_ID,
          actorId: ADMIN_ID,
        }),
      ).rejects.toThrow(LastAdminException);
    });

    it('does not apply to judges and athletes, even with no admin left', async () => {
      const repo = new FakeAccountRepository([
        makeAccount({ id: TARGET_ID, role: UserRoles.JUDGE }),
      ]);

      await expect(
        new DeactivateAccountUseCase(repo).execute({
          accountId: TARGET_ID,
          actorId: ADMIN_ID,
        }),
      ).resolves.toBeUndefined();
    });

    it('still reports an already-inactive admin as inactive, not as the last admin', async () => {
      const repo = new FakeAccountRepository([
        admin(TARGET_ID, 'a@fdff.test', AccountStatus.INACTIVE),
      ]);

      await expect(
        new DeactivateAccountUseCase(repo).execute({
          accountId: TARGET_ID,
          actorId: ADMIN_ID,
        }),
      ).rejects.toThrow(AccountAlreadyInactiveException);
    });

    it('reports the refusal as 409', () => {
      expect(new LastAdminException().statusCode).toBe(409);
    });
  });
});
