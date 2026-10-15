import { makeAccount } from '../../testing/account.fixture';
import { FakeAccountRepository } from '../../testing/fake-account.repository';
import { FakeRefreshTokenService } from '../../testing/fake-refresh-token.service';
import { LogoutAccountUseCase } from './logout-account.use-case';

const refreshTokens = new FakeRefreshTokenService();
const TOKEN = 'plain-refresh-token';

const sessionOf = (id: string, email: string, hashOf = TOKEN) =>
  makeAccount({
    id,
    email,
    refreshTokenHash: refreshTokens.hash(hashOf),
    refreshTokenExpiresAt: new Date(Date.now() + 60_000),
    previousRefreshTokenHash: 'older-token-hash',
  });

const build = (accounts = [sessionOf('a1', 'one@fdff.test')]) => {
  const repo = new FakeAccountRepository(accounts);
  return { useCase: new LogoutAccountUseCase(repo, refreshTokens), repo };
};

describe('LogoutAccountUseCase', () => {
  it('ends the session: hash, expiry and previous hash are all cleared', async () => {
    const { useCase, repo } = build();

    await useCase.execute(TOKEN);

    const stored = await repo.findById('a1');
    expect(stored?.refreshTokenHash).toBeNull();
    expect(stored?.refreshTokenExpiresAt).toBeNull();
    expect(stored?.previousRefreshTokenHash).toBeNull();
  });

  it('revokes the access tokens too, so signing out is effective at once', async () => {
    const { useCase, repo } = build();

    await useCase.execute(TOKEN);

    expect((await repo.findById('a1'))?.tokenVersion).toBe(1);
  });

  it('leaves other accounts signed in', async () => {
    const other = sessionOf('b2', 'two@fdff.test', 'other-token');
    const { useCase, repo } = build([sessionOf('a1', 'one@fdff.test'), other]);

    await useCase.execute(TOKEN);

    expect((await repo.findById('b2'))?.refreshTokenHash).toBe(
      other.refreshTokenHash,
    );
  });

  it.each([null, undefined, ''])(
    'does nothing for an empty token (%p)',
    async (token) => {
      const { useCase, repo } = build();

      await expect(useCase.execute(token)).resolves.toBeUndefined();

      expect((await repo.findById('a1'))?.refreshTokenHash).not.toBeNull();
    },
  );

  it('does nothing for an unknown token, and does not throw', async () => {
    const { useCase, repo } = build();

    await expect(useCase.execute('never-issued')).resolves.toBeUndefined();

    expect((await repo.findById('a1'))?.refreshTokenHash).not.toBeNull();
  });

  it('is safe to call twice with the same token', async () => {
    const { useCase } = build();

    await useCase.execute(TOKEN);

    await expect(useCase.execute(TOKEN)).resolves.toBeUndefined();
  });
});
