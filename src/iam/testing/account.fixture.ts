import { Account } from '../domain/account.model';
import { AccountStatus } from '../domain/enums/account-status.enum';
import { UserRoles } from '../domain/enums/user-roles.enums';

export interface AccountOverrides {
  id?: string;
  email?: string;
  passwordHash?: string;
  role?: UserRoles;
  status?: AccountStatus;
  failedLoginAttempts?: number;
  lockedUntil?: Date | null;
  refreshTokenHash?: string | null;
}

/**
 * The only place tests construct an Account. Keep it that way: the constructor is
 * positional, so centralising it means a change to Account is a change to one file.
 */
export function makeAccount(overrides: AccountOverrides = {}): Account {
  return new Account(
    overrides.id ?? '11111111-1111-4111-8111-111111111111',
    overrides.email ?? 'athlete@fdff.test',
    overrides.passwordHash ?? '$2b$10$fixture.hash.not.a.real.bcrypt.digest',
    overrides.role ?? UserRoles.ATHLETE,
    overrides.status ?? AccountStatus.ACTIVE,
    overrides.failedLoginAttempts ?? 0,
    overrides.lockedUntil ?? null,
    overrides.refreshTokenHash ?? null,
  );
}
