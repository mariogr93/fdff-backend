import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { BEARER_AUTH } from '../../shared/http/setup-openapi';
import type { AuthenticatedUser } from '../application/ports/authenticated-user';
import { ActivateAccountUseCase } from '../application/use-cases/activate-account.use-case';
import { CreateAccountUseCase } from '../application/use-cases/create-account.use-case';
import { DeactivateAccountUseCase } from '../application/use-cases/deactivate-account.use-case';
import { GetAccountsUseCase } from '../application/use-cases/get-accounts.use-case';
import { UserRoles } from '../domain/enums/user-roles.enums';
import {
  AccountResponseDto,
  AccountsPageResponseDto,
} from './dtos/account-response.dto';
import { AccountsListRequestDto } from './dtos/accounts-list-request.dto';
import { CreateAccountDto } from './dtos/create-account.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles, RolesGuard } from './guards/roles.guard';

@ApiTags('accounts')
@ApiBearerAuth(BEARER_AUTH)
@ApiUnauthorizedResponse({
  description: 'Missing, expired or revoked access token.',
})
@ApiForbiddenResponse({ description: 'The caller is not an ADMIN.' })
@Controller('accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRoles.ADMIN)
export class AccountController {
  constructor(
    private readonly getAccountsUseCase: GetAccountsUseCase,
    private readonly createAccountUseCase: CreateAccountUseCase,
    private readonly activateAccountUseCase: ActivateAccountUseCase,
    private readonly deactivateAccountUseCase: DeactivateAccountUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List accounts, filtered and paginated.' })
  async getAccounts(
    @Query() query: AccountsListRequestDto,
  ): Promise<AccountsPageResponseDto> {
    const { rows, total } = await this.getAccountsUseCase.execute(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    return {
      data: rows.map((account) => ({
        id: account.id,
        email: account.email,
        role: account.role,
        status: account.status,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Admin-provisioned accounts — judges above all. Public signup lives at
   * POST /auth/register and can only ever create a PENDING ATHLETE; this is
   * the only route that accepts an explicit role, and the class-level guards
   * restrict it to admins.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an account with any role. It is ACTIVE immediately.',
  })
  async createAccount(
    @Body() dto: CreateAccountDto,
  ): Promise<AccountResponseDto> {
    const account = await this.createAccountUseCase.execute({
      email: dto.email,
      plainPassword: dto.password,
      role: dto.role,
    });

    return {
      id: account.id,
      email: account.email,
      role: account.role,
      status: account.status,
    };
  }

  // ParseUUIDPipe turns a malformed id into a 400 here, rather than letting
  // Postgres reject it as invalid uuid syntax and surface a 500.
  @Post('activate/:accountId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'PENDING or INACTIVE becomes ACTIVE.' })
  @ApiNoContentResponse({ description: 'Activated.' })
  @ApiNotFoundResponse({ description: 'No account with that id.' })
  @ApiConflictResponse({ description: 'The account is already active.' })
  async activateAccount(
    @Param('accountId', ParseUUIDPipe) accountId: string,
  ): Promise<void> {
    await this.activateAccountUseCase.execute({ accountId });
  }

  @Post('deactivate/:accountId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Disable an account, end its session and revoke its access tokens. Rejects a PENDING signup.',
  })
  @ApiNoContentResponse({ description: 'Deactivated.' })
  @ApiNotFoundResponse({ description: 'No account with that id.' })
  @ApiConflictResponse({
    description:
      'Already inactive, your own account, or the last active admin.',
  })
  async deactivateAccount(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ): Promise<void> {
    await this.deactivateAccountUseCase.execute({
      accountId,
      actorId: req.user.id,
    });
  }
}
