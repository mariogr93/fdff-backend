import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AuthenticatedUser } from '../../application/ports/authenticated-user';
import { UserRoles } from '../../domain/enums/user-roles.enums';
import { ForbiddenRoleException } from '../../domain/exceptions/forbidden-role.exception';
import { PasswordChangeRequiredException } from '../../domain/exceptions/password-change-required.exception';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRoles[]) => SetMetadata(ROLES_KEY, roles);

export const ALLOW_WHILE_PASSWORD_CHANGE_PENDING_KEY =
  'allowWhilePasswordChangePending';
/** Marks the few routes a session restricted to changing the password may call. */
export const AllowWhilePasswordChangePending = () =>
  SetMetadata(ALLOW_WHILE_PASSWORD_CHANGE_PENDING_KEY, true);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    // Checked before the role, so every guarded route is covered unless it
    // opts out explicitly.
    if (user?.mustChangePassword) {
      const allowed = this.reflector.getAllAndOverride<boolean | undefined>(
        ALLOW_WHILE_PASSWORD_CHANGE_PENDING_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!allowed) throw new PasswordChangeRequiredException();
    }

    const required = this.reflector.getAllAndOverride<UserRoles[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Deny by default: a route without @Roles is refused, not opened to every role.
    if (!required?.length || !user || !required.includes(user.role)) {
      throw new ForbiddenRoleException();
    }
    return true;
  }
}
