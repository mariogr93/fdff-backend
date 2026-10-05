import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import {
  I_ACCOUNT_REPOSITORY,
  type IAccountRepository,
} from '../../application/ports/account.repository.interface';
import {
  I_TOKEN_SERVICE,
  type ITokenServicePort,
} from '../../application/ports/token.service.port';
import { AccountStatus } from '../../domain/enums/account-status.enum';
import { UserRoles } from '../../domain/enums/user-roles.enums';
import { ForbiddenRoleAssignmentException } from '../../domain/exceptions/forbidden-role-assignment.exception';

@Injectable()
export class RegisterRoleGuard implements CanActivate {
  constructor(
    @Inject(I_TOKEN_SERVICE)
    private readonly tokenService: ITokenServicePort,
    @Inject(I_ACCOUNT_REPOSITORY)
    private readonly accountRepo: IAccountRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const role =
      (request.body?.role as UserRoles | undefined) ?? UserRoles.ATHLETE;

    if (role === UserRoles.ATHLETE) {
      return true;
    }

    if (role !== UserRoles.ADMIN && role !== UserRoles.JUDGE) {
      return true;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new ForbiddenRoleAssignmentException();
    }

    const token = authHeader.slice(7);

    try {
      const identity = await this.tokenService.verify(token);
      const account = await this.accountRepo.findById(identity.id);

      if (
        !account ||
        account.status !== AccountStatus.ACTIVE ||
        account.role !== UserRoles.ADMIN
      ) {
        throw new ForbiddenRoleAssignmentException();
      }

      return true;
    } catch (error) {
      if (
        error instanceof ForbiddenRoleAssignmentException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new ForbiddenRoleAssignmentException();
    }
  }
}
