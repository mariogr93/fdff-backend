import { AccountAlreadyExistsException } from '../domain/exceptions/account-already-exists.exception';
import { makeAccount } from './account.fixture';
import { FakeAccountRepository } from './fake-account.repository';

describe('FakeAccountRepository', () => {
  it('save rejects a duplicate email, like the unique constraint', async () => {
    const repo = new FakeAccountRepository([
      makeAccount({ email: 'a@x.test' }),
    ]);
    const other = makeAccount({ id: 'other-id', email: 'a@x.test' });

    await expect(repo.save(other)).rejects.toBeInstanceOf(
      AccountAlreadyExistsException,
    );
  });

  describe('updateIfRefreshTokenHashIs', () => {
    it('writes and returns true when the hash still matches', async () => {
      const account = makeAccount({ refreshTokenHash: 'old' });
      const repo = new FakeAccountRepository([account]);
      const rotated = account.withRefreshToken('new', new Date());

      expect(await repo.updateIfRefreshTokenHashIs(rotated, 'old')).toBe(true);
      expect((await repo.findById(account.id))?.refreshTokenHash).toBe('new');
    });

    it('does not write and returns false when the hash changed', async () => {
      const account = makeAccount({ refreshTokenHash: 'current' });
      const repo = new FakeAccountRepository([account]);
      const rotated = account.withRefreshToken('new', new Date());

      expect(await repo.updateIfRefreshTokenHashIs(rotated, 'stale')).toBe(
        false,
      );
      expect((await repo.findById(account.id))?.refreshTokenHash).toBe(
        'current',
      );
    });

    it('returns false for an unknown account', async () => {
      const repo = new FakeAccountRepository();

      expect(await repo.updateIfRefreshTokenHashIs(makeAccount(), 'x')).toBe(
        false,
      );
    });
  });
});
