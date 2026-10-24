import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRoles } from '../../domain/enums/user-roles.enums';
import { ForbiddenRoleException } from '../../domain/exceptions/forbidden-role.exception';
import { PasswordChangeRequiredException } from '../../domain/exceptions/password-change-required.exception';
import {
  ALLOW_WHILE_PASSWORD_CHANGE_PENDING_KEY,
  RolesGuard,
} from './roles.guard';

const contextFor = (user: unknown): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const guardRequiring = (...roles: UserRoles[]) => {
  const reflector = {
    getAllAndOverride: () => roles,
  } as unknown as Reflector;
  return new RolesGuard(reflector);
};

const user = (role: UserRoles) => ({ id: 'u1', email: 'a@x.test', role });

describe('RolesGuard', () => {
  it('allows a user whose role is required', () => {
    const guard = guardRequiring(UserRoles.ADMIN, UserRoles.JUDGE);

    expect(guard.canActivate(contextFor(user(UserRoles.JUDGE)))).toBe(true);
  });

  it('rejects a user whose role is not required', () => {
    const guard = guardRequiring(UserRoles.ADMIN);

    expect(() =>
      guard.canActivate(contextFor(user(UserRoles.ATHLETE))),
    ).toThrow(ForbiddenRoleException);
  });

  it('rejects a request with no user', () => {
    const guard = guardRequiring(UserRoles.ADMIN);

    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      ForbiddenRoleException,
    );
  });

  it('allows everything when no roles are required', () => {
    const guard = guardRequiring();

    expect(guard.canActivate(contextFor(undefined))).toBe(true);
  });

  describe('session restricted to changing the password', () => {
    const restricted = { ...user(UserRoles.ATHLETE), mustChangePassword: true };

    /** Roles and the opt-out flag are looked up by key, as the real Reflector does. */
    const guardWith = (roles: UserRoles[], allowedWhileRestricted: boolean) =>
      new RolesGuard({
        getAllAndOverride: (key: string) =>
          key === ALLOW_WHILE_PASSWORD_CHANGE_PENDING_KEY
            ? allowedWhileRestricted
            : roles,
      } as unknown as Reflector);

    it('refuses a route that did not opt out, even when the role matches', () => {
      const guard = guardWith([UserRoles.ATHLETE], false);

      expect(() => guard.canActivate(contextFor(restricted))).toThrow(
        PasswordChangeRequiredException,
      );
    });

    it('refuses a route that requires no roles, so a missing @Roles cannot open it', () => {
      const guard = guardWith([], false);

      expect(() => guard.canActivate(contextFor(restricted))).toThrow(
        PasswordChangeRequiredException,
      );
    });

    it('allows a route that opted out and whose role matches', () => {
      const guard = guardWith([UserRoles.ATHLETE], true);

      expect(guard.canActivate(contextFor(restricted))).toBe(true);
    });

    it('still checks the role on a route that opted out', () => {
      const guard = guardWith([UserRoles.ADMIN], true);

      expect(() => guard.canActivate(contextFor(restricted))).toThrow(
        ForbiddenRoleException,
      );
    });

    it('does not affect a session that is not restricted', () => {
      const guard = guardWith([UserRoles.ATHLETE], false);

      expect(
        guard.canActivate(
          contextFor({ ...user(UserRoles.ATHLETE), mustChangePassword: false }),
        ),
      ).toBe(true);
    });
  });
});
