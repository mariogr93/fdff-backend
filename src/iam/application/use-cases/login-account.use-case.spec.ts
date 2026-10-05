import { AccountStatus } from '../../domain/enums/account-status.enum';
import { AccountLockedException } from '../../domain/exceptions/account-locked.exception';
import { AccountNotActivatedException } from '../../domain/exceptions/account-not-activated.exception';
import { InvalidCredentialsException } from '../../domain/exceptions/invalid-credentials.exception';
import { makeAccount } from '../../testing/account.fixture';
import { FakeAccountRepository } from '../../testing/fake-account.repository';
import type { AuthPolicy } from '../ports/auth-policy';
import type { IPasswordHasherPort } from '../ports/password-hasher.port';
import type { ITokenServicePort } from '../ports/token.service.port';
import { LoginAccountUseCase } from './login-account.use-case';

const policy: AuthPolicy = {
  refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
  lockout: { maxFailedAttempts: 3, lockoutDurationMs: 60_000 },
};

const build = (accounts = [makeAccount()]) => {
  const repo = new FakeAccountRepository(accounts);

  // Held as standalone consts so assertions don't read them back off the
  // object, which trips the unbound-method lint rule.
  const compare = jest.fn((plain: string) =>
    Promise.resolve(plain === 'correct'),
  );
  const sign = jest.fn(() => Promise.resolve({ accessToken: 'access-token' }));

  /** Accepts the password "correct" and nothing else. */
  const passwordHasher: IPasswordHasherPort = {
    hash: jest.fn(() => Promise.resolve('hashed')),
    compare,
  };
  const tokenService: ITokenServicePort = {
    sign,
    verify: jest.fn(() =>
      Promise.resolve({ id: 'id', email: 'athlete@fdff.test' }),
    ),
  };

  const useCase = new LoginAccountUseCase(
    repo,
    passwordHasher,
    tokenService,
    policy,
  );

  return { useCase, repo, compare, sign };
};

const login = (email = 'athlete@fdff.test', plainPassword = 'correct') => ({
  email,
  plainPassword,
});

describe('LoginAccountUseCase', () => {
  it('issues an access token and stores a refresh hash on success', async () => {
    const account = makeAccount({ status: AccountStatus.ACTIVE });
    const { useCase, repo, sign } = build([account]);

    const result = await useCase.execute(login());

    expect(result.accessToken).toBe('access-token');
    expect(result.accountId).toBe(account.id);
    expect(result.role).toBe(account.role);
    expect(result.refreshToken).toHaveLength(64);
    expect(sign).toHaveBeenCalledWith({
      id: account.id,
      email: account.email,
    });

    // The plain token is returned to the caller; only its hash is persisted.
    const stored = await repo.findById(account.id);
    expect(stored?.refreshTokenHash).toBeTruthy();
    expect(stored?.refreshTokenHash).not.toBe(result.refreshToken);
  });

  it('rejects an unknown email without revealing that it is unknown', async () => {
    const { useCase, compare } = build([]);

    await expect(useCase.execute(login('nobody@fdff.test'))).rejects.toThrow(
      InvalidCredentialsException,
    );

    // Still pays the bcrypt cost, so timing does not leak account existence.
    expect(compare).toHaveBeenCalledTimes(1);
  });

  it('rejects a wrong password and counts the attempt', async () => {
    const account = makeAccount({ failedLoginAttempts: 0 });
    const { useCase, repo } = build([account]);

    await expect(
      useCase.execute(login(account.email, 'wrong')),
    ).rejects.toThrow(InvalidCredentialsException);

    expect((await repo.findById(account.id))?.failedLoginAttempts).toBe(1);
  });

  it('locks the account once the attempt threshold is reached', async () => {
    const account = makeAccount({ failedLoginAttempts: 2 });
    const { useCase, repo } = build([account]);

    await expect(
      useCase.execute(login(account.email, 'wrong')),
    ).rejects.toThrow(InvalidCredentialsException);

    const locked = await repo.findById(account.id);
    expect(locked?.failedLoginAttempts).toBe(3);
    expect(locked?.isLocked(new Date())).toBe(true);
  });

  it('refuses a locked account before checking the password at all', async () => {
    const account = makeAccount({
      failedLoginAttempts: 3,
      lockedUntil: new Date(Date.now() + 60_000),
    });
    const { useCase, compare } = build([account]);

    await expect(useCase.execute(login())).rejects.toThrow(
      AccountLockedException,
    );

    // Documents the known trade-off: short-circuiting before bcrypt is a
    // timing signal that a locked account exists.
    expect(compare).not.toHaveBeenCalled();
  });

  it('refuses a pending account even with the right password, and clears its attempts', async () => {
    const account = makeAccount({
      status: AccountStatus.PENDING,
      failedLoginAttempts: 2,
    });
    const { useCase, repo } = build([account]);

    await expect(useCase.execute(login())).rejects.toThrow(
      AccountNotActivatedException,
    );

    const stored = await repo.findById(account.id);
    expect(stored?.failedLoginAttempts).toBe(0);
    expect(stored?.refreshTokenHash).toBeNull();
  });

  it('refuses an inactive account', async () => {
    const { useCase } = build([
      makeAccount({ status: AccountStatus.INACTIVE }),
    ]);

    await expect(useCase.execute(login())).rejects.toThrow(
      AccountNotActivatedException,
    );
  });

  it('clears a stale attempt counter on a successful login', async () => {
    const account = makeAccount({ failedLoginAttempts: 2 });
    const { useCase, repo } = build([account]);

    await useCase.execute(login());

    expect((await repo.findById(account.id))?.failedLoginAttempts).toBe(0);
  });

  it('rotates the refresh hash on each login', async () => {
    const account = makeAccount({ refreshTokenHash: 'old-hash' });
    const { useCase, repo } = build([account]);

    await useCase.execute(login());

    expect((await repo.findById(account.id))?.refreshTokenHash).not.toBe(
      'old-hash',
    );
  });
});
