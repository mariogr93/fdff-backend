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
      });

      expect(account.deactivate().refreshTokenHash).toBeNull();
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

  describe('refresh token', () => {
    it('stores a hash', () => {
      const next = makeAccount({ refreshTokenHash: null }).withRefreshToken(
        'hash',
      );
      expect(next.refreshTokenHash).toBe('hash');
    });

    it('clears a hash back to null', () => {
      const next = makeAccount({
        refreshTokenHash: 'hash',
      }).clearRefreshToken();
      expect(next.refreshTokenHash).toBeNull();
    });

    it('chains with clearLoginAttempts', () => {
      const account = makeAccount({
        failedLoginAttempts: 2,
        refreshTokenHash: null,
      });

      const next = account.clearLoginAttempts().withRefreshToken('hash');

      expect(next.failedLoginAttempts).toBe(0);
      expect(next.refreshTokenHash).toBe('hash');
    });
  });
});
