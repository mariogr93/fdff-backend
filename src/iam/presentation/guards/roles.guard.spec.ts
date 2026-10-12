import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRoles } from '../../domain/enums/user-roles.enums';
import { ForbiddenRoleException } from '../../domain/exceptions/forbidden-role.exception';
import { RolesGuard } from './roles.guard';

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
});
