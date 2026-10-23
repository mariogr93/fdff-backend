import { makeAccount } from '../testing/account.fixture';
import { DEFAULT_LOCKOUT_POLICY, type LockoutPolicy } from './account.model';
import { AccountStatus } from './enums/account-status.enum';
import { AccountAlreadyActiveException } from './exceptions/account-already-active.exception';
import { AccountAlreadyInactiveException } from './exceptions/account-already-inactive.exception';

const NOW = new Date('2026-10-05T12:00:00.000Z');
const policy: LockoutPolicy = {
  maxFailedAttempts: 3,
  lockoutDurationMs: 60_000,
};

describe('Account', () => {
  describe('isActive', () => {
    it.each([
      [AccountStatus.ACTIVE, true],
      [AccountStatus.PENDING, false],
      [AccountStatus.INACTIVE, false],
    ])('is %s -> %s', (status, expected) => {
      expect(makeAccount({ status }).isActive()).toBe(expected);
    });
  });

  describe('isLocked', () => {
    it('is not locked when lockedUntil is null', () => {
      expect(makeAccount({ lockedUntil: null }).isLocked(NOW)).toBe(false);
    });

    it('is locked while lockedUntil is in the future', () => {
      const account = makeAccount({ lockedUntil: new Date(NOW.getTime() + 1) });
      expect(account.isLocked(NOW)).toBe(true);
    });

    it('is no longer locked once lockedUntil has passed', () => {
      const account = makeAccount({ lockedUntil: new Date(NOW.getTime() - 1) });
      expect(account.isLocked(NOW)).toBe(false);
    });

    it('is not locked at the exact expiry instant', () => {
      expect(makeAccount({ lockedUntil: NOW }).isLocked(NOW)).toBe(false);
    });
  });

  describe('registerFailedLogin', () => {
    it('increments the counter without locking below the threshold', () => {
      const account = makeAccount({ failedLoginAttempts: 1 });

      const next = account.registerFailedLogin(policy, NOW);

      expect(next.failedLoginAttempts).toBe(2);
      expect(next.lockedUntil).toBeNull();
      expect(next.isLocked(NOW)).toBe(false);
    });

    it('locks for the policy duration on reaching the threshold', () => {
      const account = makeAccount({ failedLoginAttempts: 2 });

      const next = account.registerFailedLogin(policy, NOW);

      expect(next.failedLoginAttempts).toBe(3);
      expect(next.lockedUntil).toEqual(new Date(NOW.getTime() + 60_000));
      expect(next.isLocked(NOW)).toBe(true);
    });

    it('starts counting again once a lock has expired', () => {
      const expired = new Date(NOW.getTime() - 1_000);
      const account = makeAccount({
        failedLoginAttempts: policy.maxFailedAttempts,
        lockedUntil: expired,
      });

      const next = account.registerFailedLogin(policy, NOW);

      expect(next.failedLoginAttempts).toBe(1);
      expect(next.lockedUntil).toBeNull();
      expect(next.isLocked(NOW)).toBe(false);
    });

    it('treats a lock that ends exactly now as expired', () => {
      const account = makeAccount({
        failedLoginAttempts: policy.maxFailedAttempts,
        lockedUntil: NOW,
      });

      expect(account.registerFailedLogin(policy, NOW).failedLoginAttempts).toBe(
        1,
      );
    });

    it('locks again only after a full new set of failures post-expiry', () => {
      let account = makeAccount({
        failedLoginAttempts: policy.maxFailedAttempts,
        lockedUntil: new Date(NOW.getTime() - 1_000),
      });

      for (let i = 1; i < policy.maxFailedAttempts; i++) {
        account = account.registerFailedLogin(policy, NOW);
        expect(account.isLocked(NOW)).toBe(false);
      }
      account = account.registerFailedLogin(policy, NOW);

      expect(account.failedLoginAttempts).toBe(policy.maxFailedAttempts);
      expect(account.isLocked(NOW)).toBe(true);
    });

    it('keeps counting while a lock is still active', () => {
      const lockedUntil = new Date(NOW.getTime() + 30_000);
      const account = makeAccount({
        failedLoginAttempts: policy.maxFailedAttempts,
        lockedUntil,
      });

      const next = account.registerFailedLogin(policy, NOW);

      expect(next.failedLoginAttempts).toBe(policy.maxFailedAttempts + 1);
      expect(next.isLocked(NOW)).toBe(true);
    });

    it('does not mutate the original', () => {
      const account = makeAccount({ failedLoginAttempts: 2 });

      account.registerFailedLogin(policy, NOW);

      expect(account.failedLoginAttempts).toBe(2);
      expect(account.lockedUntil).toBeNull();
    });

    it('preserves every unrelated field', () => {
      const account = makeAccount({ refreshTokenHash: 'keep-me' });

      const next = account.registerFailedLogin(policy, NOW);

      expect(next.id).toBe(account.id);
      expect(next.email).toBe(account.email);
      expect(next.passwordHash).toBe(account.passwordHash);
      expect(next.role).toBe(account.role);
      expect(next.status).toBe(account.status);
      expect(next.refreshTokenHash).toBe('keep-me');
    });

    it('uses a five-attempt, fifteen-minute default policy', () => {
      expect(DEFAULT_LOCKOUT_POLICY).toEqual({
        maxFailedAttempts: 5,
        lockoutDurationMs: 15 * 60 * 1000,
      });
    });
  });

  describe('clearLoginAttempts', () => {
    it('resets the counter and the lock', () => {
      const account = makeAccount({
        failedLoginAttempts: 4,
        lockedUntil: new Date(NOW.getTime() + 60_000),
      });

      const next = account.clearLoginAttempts();

      expect(next.failedLoginAttempts).toBe(0);
      expect(next.lockedUntil).toBeNull();
    });

    it('returns the same instance when there is nothing to clear, so callers can chain without forcing a write', () => {
      const account = makeAccount({
        failedLoginAttempts: 0,
        lockedUntil: null,
      });

      expect(account.clearLoginAttempts()).toBe(account);
    });
  });

  describe('activate / deactivate transitions', () => {
    it.each([AccountStatus.PENDING, AccountStatus.INACTIVE])(
      'activates from %s',
      (status) => {
        expect(makeAccount({ status }).activate().status).toBe(
          AccountStatus.ACTIVE,
        );
      },
    );

    it('rejects activating an already active account', () => {
      expect(() =>
        makeAccount({ status: AccountStatus.ACTIVE }).activate(),
      ).toThrow(AccountAlreadyActiveException);
    });

    it.each([AccountStatus.ACTIVE, AccountStatus.PENDING])(
      'deactivates from %s',
      (status) => {
        expect(makeAccount({ status }).deactivate().status).toBe(
          AccountStatus.INACTIVE,
        );
      },
    );

    it('rejects deactivating an already inactive account', () => {
      expect(() =>
        makeAccount({ status: AccountStatus.INACTIVE }).deactivate(),
      ).toThrow(AccountAlreadyInactiveException);
    });

    it('drops the refresh token on deactivation, so an open session cannot be extended', () => {
      const account = makeAccount({
        status: AccountStatus.ACTIVE,
        refreshTokenHash: 'live-session',
        refreshTokenExpiresAt: new Date('2026-01-02T12:00:00Z'),
        previousRefreshTokenHash: 'older-token',
      });

      const next = account.deactivate();

      expect(next.refreshTokenHash).toBeNull();
      expect(next.refreshTokenExpiresAt).toBeNull();
      expect(next.previousRefreshTokenHash).toBeNull();
    });

    it('leaves the refresh token alone on activation', () => {
      const account = makeAccount({
        status: AccountStatus.PENDING,
        refreshTokenHash: 'existing',
      });

      expect(account.activate().refreshTokenHash).toBe('existing');
    });

    it('reports the conflict exceptions as 409', () => {
      expect(new AccountAlreadyActiveException().statusCode).toBe(409);
      expect(new AccountAlreadyInactiveException().statusCode).toBe(409);
    });

    it('does not mutate the original', () => {
      const account = makeAccount({ status: AccountStatus.PENDING });

      account.activate();

      expect(account.status).toBe(AccountStatus.PENDING);
    });
  });

  describe('token version', () => {
    const later = new Date('2026-01-02T12:00:00Z');

    it('starts at 0', () => {
      expect(makeAccount().tokenVersion).toBe(0);
    });

    it('revokeAccessTokens raises it by one without mutating the original', () => {
      const account = makeAccount({ tokenVersion: 2 });

      const next = account.revokeAccessTokens();

      expect(next.tokenVersion).toBe(3);
      expect(account.tokenVersion).toBe(2);
    });

    it.each([
      ['deactivate', (a: ReturnType<typeof makeAccount>) => a.deactivate()],
      [
        'clearRefreshToken',
        (a: ReturnType<typeof makeAccount>) => a.clearRefreshToken(),
      ],
    ])('%s revokes the access tokens', (_name, act) => {
      const account = makeAccount({
        status: AccountStatus.ACTIVE,
        tokenVersion: 5,
      });

      expect(act(account).tokenVersion).toBe(6);
    });

    it.each([
      [
        'withRefreshToken (login)',
        (a: ReturnType<typeof makeAccount>) => a.withRefreshToken('h', later),
      ],
      [
        'rotateRefreshToken (refresh)',
        (a: ReturnType<typeof makeAccount>) => a.rotateRefreshToken('h', later),
      ],
      [
        'registerFailedLogin',
        (a: ReturnType<typeof makeAccount>) =>
          a.registerFailedLogin(policy, NOW),
      ],
      [
        'clearLoginAttempts',
        (a: ReturnType<typeof makeAccount>) => a.clearLoginAttempts(),
      ],
      ['activate', (a: ReturnType<typeof makeAccount>) => a.activate()],
    ])('%s keeps it, so a new session stays valid', (_name, act) => {
      const account = makeAccount({
        status: AccountStatus.INACTIVE,
        failedLoginAttempts: 1,
        tokenVersion: 5,
      });

      expect(act(account).tokenVersion).toBe(5);
    });
  });

  describe('refresh token', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const later = new Date('2026-01-02T12:00:00Z');
    const earlier = new Date('2025-12-31T12:00:00Z');

    it('stores a hash and its expiry', () => {
      const next = makeAccount({ refreshTokenHash: null }).withRefreshToken(
        'hash',
        later,
      );
      expect(next.refreshTokenHash).toBe('hash');
      expect(next.refreshTokenExpiresAt).toEqual(later);
    });

    it('clears the hash and the expiry back to null', () => {
      const next = makeAccount({
        refreshTokenHash: 'hash',
        refreshTokenExpiresAt: later,
      }).clearRefreshToken();
      expect(next.refreshTokenHash).toBeNull();
      expect(next.refreshTokenExpiresAt).toBeNull();
    });

    describe('rotateRefreshToken', () => {
      it('swaps in the new token and remembers the one it replaced', () => {
        const account = makeAccount({
          refreshTokenHash: 'first',
          refreshTokenExpiresAt: now,
        });

        const next = account.rotateRefreshToken('second', later);

        expect(next.refreshTokenHash).toBe('second');
        expect(next.refreshTokenExpiresAt).toEqual(later);
        expect(next.previousRefreshTokenHash).toBe('first');
      });

      it('only remembers one generation back', () => {
        const next = makeAccount({ refreshTokenHash: 'first' })
          .rotateRefreshToken('second', later)
          .rotateRefreshToken('third', later);

        expect(next.previousRefreshTokenHash).toBe('second');
      });
    });

    it('forgets the previous token when a new session starts (login)', () => {
      const account = makeAccount({
        refreshTokenHash: 'other-device',
        previousRefreshTokenHash: 'older',
      });

      const next = account.withRefreshToken('fresh', later);

      expect(next.previousRefreshTokenHash).toBeNull();
    });

    it('clears the previous token together with the current one', () => {
      const next = makeAccount({
        refreshTokenHash: 'hash',
        previousRefreshTokenHash: 'older',
      }).clearRefreshToken();

      expect(next.previousRefreshTokenHash).toBeNull();
    });

    describe('hasLiveRefreshToken', () => {
      it('is true before the expiry', () => {
        const account = makeAccount({
          refreshTokenHash: 'hash',
          refreshTokenExpiresAt: later,
        });
        expect(account.hasLiveRefreshToken(now)).toBe(true);
      });

      it('is false at and after the expiry', () => {
        const account = makeAccount({
          refreshTokenHash: 'hash',
          refreshTokenExpiresAt: later,
        });
        expect(account.hasLiveRefreshToken(later)).toBe(false);
        expect(
          makeAccount({
            refreshTokenHash: 'hash',
            refreshTokenExpiresAt: earlier,
          }).hasLiveRefreshToken(now),
        ).toBe(false);
      });

      it('is false for a hash with no expiry, so old sessions fail closed', () => {
        const account = makeAccount({
          refreshTokenHash: 'hash',
          refreshTokenExpiresAt: null,
        });
        expect(account.hasLiveRefreshToken(now)).toBe(false);
      });

      it('is false when there is no hash', () => {
        expect(makeAccount().hasLiveRefreshToken(now)).toBe(false);
      });
    });

    it('chains with clearLoginAttempts', () => {
      const account = makeAccount({
        failedLoginAttempts: 2,
        refreshTokenHash: null,
      });

      const next = account
        .clearLoginAttempts()
        .withRefreshToken('hash', new Date('2026-01-02T12:00:00Z'));

      expect(next.failedLoginAttempts).toBe(0);
      expect(next.refreshTokenHash).toBe('hash');
    });
  });

  describe('changePassword', () => {
    const account = makeAccount({
      passwordHash: 'old',
      failedLoginAttempts: 2,
      lockedUntil: new Date('2026-10-05T12:10:00.000Z'),
      refreshTokenHash: 'current',
      refreshTokenExpiresAt: new Date('2026-10-06T12:00:00.000Z'),
      previousRefreshTokenHash: 'older',
      tokenVersion: 4,
    });

    it('replaces the hash and ends the session', () => {
      const next = account.changePassword('new');

      expect(next.passwordHash).toBe('new');
      expect(next.refreshTokenHash).toBeNull();
      expect(next.refreshTokenExpiresAt).toBeNull();
      expect(next.previousRefreshTokenHash).toBeNull();
    });

    it('revokes the access tokens already issued', () => {
      expect(account.changePassword('new').tokenVersion).toBe(5);
    });

    it('clears failed attempts and any lock', () => {
      const next = account.changePassword('new');

      expect(next.failedLoginAttempts).toBe(0);
      expect(next.lockedUntil).toBeNull();
    });

    it('keeps identity, role and status', () => {
      const next = account.changePassword('new');

      expect(next).toMatchObject({
        id: account.id,
        email: account.email,
        role: account.role,
        status: account.status,
      });
    });
  });
});
