import { AccountStatus } from '../../domain/enums/account-status.enum';
import { InvalidRefreshTokenException } from '../../domain/exceptions/invalid-refresh-token.exception';
import { makeAccount } from '../../testing/account.fixture';
import { FakeAccountRepository } from '../../testing/fake-account.repository';
import { FakeRefreshTokenService } from '../../testing/fake-refresh-token.service';
import type { AuthPolicy } from '../ports/auth-policy';
import type { ITokenServicePort } from '../ports/token.service.port';
import { RefreshAccountUseCase } from './refresh-account.use-case';

const DAY_MS = 24 * 60 * 60 * 1000;
const policy: AuthPolicy = {
  refreshTokenTtlMs: DAY_MS,
  lockout: { maxFailedAttempts: 3, lockoutDurationMs: 60_000 },
  secureCookies: true,
};

const refreshTokens = new FakeRefreshTokenService();
const TOKEN = 'plain-refresh-token';
const HASH = refreshTokens.hash(TOKEN);

/** An account that holds a refresh token, live for another hour by default. */
const sessionOf = (overrides: Parameters<typeof makeAccount>[0] = {}) =>
  makeAccount({
    refreshTokenHash: HASH,
    refreshTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ...overrides,
  });

const build = (accounts = [sessionOf()]) => {
  const repo = new FakeAccountRepository(accounts);
  const sign = jest.fn(() => Promise.resolve({ accessToken: 'access-token' }));
  const tokenService: ITokenServicePort = { sign };
  const useCase = new RefreshAccountUseCase(
    repo,
    tokenService,
    new FakeRefreshTokenService(),
    policy,
  );
  return { useCase, repo, sign };
};

describe('RefreshAccountUseCase', () => {
  it('signs with the current token version and does not revoke on a normal refresh', async () => {
    const account = sessionOf({ tokenVersion: 4 });
    const { useCase, repo, sign } = build([account]);

    await useCase.execute(TOKEN);

    expect(sign).toHaveBeenCalledWith(
      expect.objectContaining({ tokenVersion: 4 }),
    );
    expect((await repo.findById(account.id))?.tokenVersion).toBe(4);
  });

  it('issues a new access token and rotates the refresh token', async () => {
    const account = sessionOf();
    const { useCase, repo, sign } = build([account]);

    const before = Date.now();
    const result = await useCase.execute(TOKEN);
    const after = Date.now();

    expect(result.accessToken).toBe('access-token');
    expect(result.accountId).toBe(account.id);
    expect(result.role).toBe(account.role);
    expect(result.refreshToken).not.toBe(TOKEN);
    expect(sign).toHaveBeenCalledWith({
      id: account.id,
      email: account.email,
      tokenVersion: 0,
    });

    const stored = await repo.findById(account.id);
    expect(stored?.refreshTokenHash).toBe(
      refreshTokens.hash(result.refreshToken),
    );
    expect(stored?.refreshTokenHash).not.toBe(HASH);
    const expiresAt = stored?.refreshTokenExpiresAt?.getTime() ?? 0;
    expect(expiresAt).toBeGreaterThanOrEqual(before + policy.refreshTokenTtlMs);
    expect(expiresAt).toBeLessThanOrEqual(after + policy.refreshTokenTtlMs);
  });

  it('rejects the old token once it has been rotated', async () => {
    const { useCase } = build();

    await useCase.execute(TOKEN);

    await expect(useCase.execute(TOKEN)).rejects.toThrow(
      InvalidRefreshTokenException,
    );
  });

  it('rejects an expired token', async () => {
    const account = sessionOf({
      refreshTokenExpiresAt: new Date(Date.now() - 1_000),
    });
    const { useCase, sign } = build([account]);

    await expect(useCase.execute(TOKEN)).rejects.toThrow(
      InvalidRefreshTokenException,
    );
    expect(sign).not.toHaveBeenCalled();
  });

  it('rejects a stored hash that has no expiry, so old sessions fail closed', async () => {
    const account = sessionOf({ refreshTokenExpiresAt: null });
    const { useCase } = build([account]);

    await expect(useCase.execute(TOKEN)).rejects.toThrow(
      InvalidRefreshTokenException,
    );
  });

  it.each([AccountStatus.PENDING, AccountStatus.INACTIVE])(
    'rejects a %s account',
    async (status) => {
      const { useCase } = build([sessionOf({ status })]);

      await expect(useCase.execute(TOKEN)).rejects.toThrow(
        InvalidRefreshTokenException,
      );
    },
  );

  it('rejects an unknown token', async () => {
    const { useCase } = build();

    await expect(useCase.execute('never-issued')).rejects.toThrow(
      InvalidRefreshTokenException,
    );
  });

  describe('reuse detection', () => {
    it('remembers the replaced token after a rotation', async () => {
      const account = sessionOf();
      const { useCase, repo } = build([account]);

      await useCase.execute(TOKEN);

      expect((await repo.findById(account.id))?.previousRefreshTokenHash).toBe(
        HASH,
      );
    });

    it('ends the whole session when an already-replaced token is presented', async () => {
      const account = sessionOf();
      const { useCase, repo } = build([account]);
      const { refreshToken: current } = await useCase.execute(TOKEN);

      await expect(useCase.execute(TOKEN)).rejects.toThrow(
        InvalidRefreshTokenException,
      );

      const stored = await repo.findById(account.id);
      expect(stored?.refreshTokenHash).toBeNull();
      expect(stored?.refreshTokenExpiresAt).toBeNull();
      expect(stored?.previousRefreshTokenHash).toBeNull();
      // The access tokens a thief may hold are revoked with the session.
      expect(stored?.tokenVersion).toBe(account.tokenVersion + 1);
      // The legitimate holder of the newest token is signed out too.
      await expect(useCase.execute(current)).rejects.toThrow(
        InvalidRefreshTokenException,
      );
    });

    it('does nothing for a token that was never issued', async () => {
      const account = sessionOf();
      const { useCase, repo } = build([account]);

      await expect(useCase.execute('never-issued')).rejects.toThrow(
        InvalidRefreshTokenException,
      );

      const stored = await repo.findById(account.id);
      expect(stored?.refreshTokenHash).toBe(HASH);
    });

    it('does not treat an expired current token as theft', async () => {
      const account = sessionOf({
        refreshTokenExpiresAt: new Date(Date.now() - 1_000),
        previousRefreshTokenHash: 'older',
      });
      const { useCase, repo } = build([account]);

      await expect(useCase.execute(TOKEN)).rejects.toThrow(
        InvalidRefreshTokenException,
      );

      expect((await repo.findById(account.id))?.refreshTokenHash).toBe(HASH);
    });
  });

  it('lets only one of two simultaneous refreshes with the same token win', async () => {
    const account = sessionOf();
    const { useCase, repo } = build([account]);

    const results = await Promise.allSettled([
      useCase.execute(TOKEN),
      useCase.execute(TOKEN),
    ]);

    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r) => r.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toBeInstanceOf(InvalidRefreshTokenException);

    // The stored hash belongs to the winner's new token, not to a loser's.
    const winner = (won[0] as PromiseFulfilledResult<{ refreshToken: string }>)
      .value;
    expect((await repo.findById(account.id))?.refreshTokenHash).toBe(
      refreshTokens.hash(winner.refreshToken),
    );
  });
});
