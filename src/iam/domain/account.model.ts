import { AccountStatus } from './enums/account-status.enum';
import { UserRoles } from './enums/user-roles.enums';
import { AccountAlreadyActiveException } from './exceptions/account-already-active.exception';
import { AccountAlreadyInactiveException } from './exceptions/account-already-inactive.exception';

/**
 * How many failed logins lock an account, and for how long. These are an
 * operations lever rather than a business invariant, so they are passed in
 * instead of hardcoded: the entity must not read configuration.
 */
export interface LockoutPolicy {
  maxFailedAttempts: number;
  lockoutDurationMs: number;
}

export const DEFAULT_LOCKOUT_POLICY: LockoutPolicy = {
  maxFailedAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000,
};

interface AccountState {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRoles;
  status: AccountStatus;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  refreshTokenHash: string | null;
  refreshTokenExpiresAt: Date | null;
  previousRefreshTokenHash: string | null;
}

export class Account {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly role: UserRoles,
    public readonly status: AccountStatus,
    public readonly failedLoginAttempts: number = 0,
    public readonly lockedUntil: Date | null = null,
    public readonly refreshTokenHash: string | null = null,
    public readonly refreshTokenExpiresAt: Date | null = null,
    public readonly previousRefreshTokenHash: string | null = null,
  ) {}

  /**
   * Whether the account may be used at all. Callers decide which error to
   * raise: login says the account is not activated, refresh stays deliberately
   * vague so it cannot be used to probe account state.
   */
  isActive(): boolean {
    return this.status === AccountStatus.ACTIVE;
  }

  /** `now` is a parameter so lockout behaviour is testable without faking time. */
  isLocked(now: Date): boolean {
    return this.lockedUntil !== null && this.lockedUntil > now;
  }

  registerFailedLogin(policy: LockoutPolicy, now: Date): Account {
    // An expired lock is a fresh start. Without this the counter stays at the
    // threshold, so the first wrong password after the lock ends relocks.
    const lockExpired = this.lockedUntil !== null && this.lockedUntil <= now;
    const failedLoginAttempts =
      (lockExpired ? 0 : this.failedLoginAttempts) + 1;
    const lockedUntil =
      failedLoginAttempts >= policy.maxFailedAttempts
        ? new Date(now.getTime() + policy.lockoutDurationMs)
        : lockExpired
          ? null
          : this.lockedUntil;

    return this.copyWith({ failedLoginAttempts, lockedUntil });
  }

  /** Returns the same instance when there is nothing to clear, so callers can
   *  chain without forcing a pointless write. */
  clearLoginAttempts(): Account {
    if (this.failedLoginAttempts === 0 && this.lockedUntil === null) {
      return this;
    }

    return this.copyWith({ failedLoginAttempts: 0, lockedUntil: null });
  }

  /**
   * Makes the account usable, whether it is newly registered (PENDING) or was
   * disabled earlier (INACTIVE) — the admin accounts page toggles both ways.
   */
  activate(): Account {
    if (this.status === AccountStatus.ACTIVE) {
      throw new AccountAlreadyActiveException();
    }

    return this.copyWith({ status: AccountStatus.ACTIVE });
  }

  /**
   * Disables the account and drops its refresh token, so an open session
   * cannot be extended past the moment access was revoked. Deactivating a
   * PENDING account is how a registration is rejected: the enum has no
   * REJECTED value.
   */
  deactivate(): Account {
    if (this.status === AccountStatus.INACTIVE) {
      throw new AccountAlreadyInactiveException();
    }

    return this.copyWith({
      status: AccountStatus.INACTIVE,
      refreshTokenHash: null,
      refreshTokenExpiresAt: null,
      previousRefreshTokenHash: null,
    });
  }

  /**
   * Starts a session (login). Deliberately forgets any previous token: a login
   * is not a rotation, so the token it replaces must not later look like theft
   * when another device still holds it.
   */
  withRefreshToken(refreshTokenHash: string, expiresAt: Date): Account {
    return this.copyWith({
      refreshTokenHash,
      refreshTokenExpiresAt: expiresAt,
      previousRefreshTokenHash: null,
    });
  }

  /**
   * Replaces the token within an existing session (refresh) and remembers the
   * one it replaced, so a later presentation of that old token can be
   * recognised as reuse.
   */
  rotateRefreshToken(refreshTokenHash: string, expiresAt: Date): Account {
    return this.copyWith({
      refreshTokenHash,
      refreshTokenExpiresAt: expiresAt,
      previousRefreshTokenHash: this.refreshTokenHash,
    });
  }

  clearRefreshToken(): Account {
    return this.copyWith({
      refreshTokenHash: null,
      refreshTokenExpiresAt: null,
      previousRefreshTokenHash: null,
    });
  }

  /** A stored token with no expiry date counts as expired: fail closed. */
  hasLiveRefreshToken(now: Date): boolean {
    return (
      this.refreshTokenHash !== null &&
      this.refreshTokenExpiresAt !== null &&
      this.refreshTokenExpiresAt > now
    );
  }

  /**
   * Single place that rebuilds an Account. Fields are listed explicitly rather
   * than merged with `??` so that clearing a field to null actually works.
   */
  private copyWith(changes: Partial<AccountState>): Account {
    const next: AccountState = {
      id: this.id,
      email: this.email,
      passwordHash: this.passwordHash,
      role: this.role,
      status: this.status,
      failedLoginAttempts: this.failedLoginAttempts,
      lockedUntil: this.lockedUntil,
      refreshTokenHash: this.refreshTokenHash,
      refreshTokenExpiresAt: this.refreshTokenExpiresAt,
      previousRefreshTokenHash: this.previousRefreshTokenHash,
      ...changes,
    };

    return new Account(
      next.id,
      next.email,
      next.passwordHash,
      next.role,
      next.status,
      next.failedLoginAttempts,
      next.lockedUntil,
      next.refreshTokenHash,
      next.refreshTokenExpiresAt,
      next.previousRefreshTokenHash,
    );
  }
}
