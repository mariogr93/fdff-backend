import { CanActivate, ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Account } from "src/iam/domain/account.model";
import { UserRoles } from "src/iam/domain/enums/user-roles.enums";
import { ForbiddenRoleException } from "src/iam/domain/exceptions/forbidden-role.exception";

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRoles[]) => SetMetadata(ROLES_KEY, roles);


@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRoles[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const { user } = context.switchToHttp().getRequest<{ user: Account }>();
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenRoleException(); // or ForbiddenException
    }
    return true;
  }
}