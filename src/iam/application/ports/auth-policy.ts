import { LockoutPolicy } from '../../domain/account.model';

export const I_AUTH_POLICY = Symbol('I_AUTH_POLICY');

/**
 * Every tunable auth value, resolved from configuration once in iam.module.ts.
 *
 * Before this existed, REFRESH_TOKEN_EXPIRES_DAYS was parsed independently in
 * the login and refresh use cases, each with its own default, and the lockout
 * thresholds were hardcoded constants in a third place.
 */
export interface AuthPolicy {
  /** Cookie max-age and the lifetime of a stored refresh token hash. */
  refreshTokenTtlMs: number;
  lockout: LockoutPolicy;
}
