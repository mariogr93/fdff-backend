import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { RegisterRoleGuard } from '../../shared/guards/register-role.guard';
import { LoginAccountUseCase } from '../application/use-cases/login-account.use-case';
import { RefreshAccountUseCase } from '../application/use-cases/refresh-account.use-case';
import { RegisterAccountUseCase } from '../application/use-cases/register-account.use-case';
import { UserRoles } from '../domain/enums/user-roles.enums';
import {
  buildRefreshTokenCookieOptions,
  REFRESH_TOKEN_COOKIE,
} from '../infrastructure/security/auth-cookie.util';
import { LoginDto } from './dtos/login.dto';
import { RegisterAccountDto } from './dtos/register-account.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerAccount: RegisterAccountUseCase,
    private readonly loginAccount: LoginAccountUseCase,
    private readonly refreshAccount: RefreshAccountUseCase,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @UseGuards(RegisterRoleGuard)
  async register(@Body() dto: RegisterAccountDto) {
    const account = await this.registerAccount.execute({
      email: dto.email,
      plainPassword: dto.password,
      role: dto.role ?? UserRoles.ATHLETE,
    });

    return {
      id: account.id,
      email: account.email,
      role: account.role,
      status: account.status,
    };
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.loginAccount.execute({
      email: dto.email,
      plainPassword: dto.password,
    });

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    res.cookie(
      REFRESH_TOKEN_COOKIE,
      result.refreshToken,
      buildRefreshTokenCookieOptions(
        this.loginAccount.refreshTokenTtlMs,
        isProduction,
      ),
    );

    return {
      accessToken: result.accessToken,
      accountId: result.accountId,
      role: result.role,
    };
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const plainRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!plainRefreshToken) {
      throw new UnauthorizedException('Refresh token cookie is missing.');
    }

    const result = await this.refreshAccount.execute(plainRefreshToken);
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    res.cookie(
      REFRESH_TOKEN_COOKIE,
      result.refreshToken,
      buildRefreshTokenCookieOptions(
        this.refreshAccount.refreshTokenTtlMs,
        isProduction,
      ),
    );

    return {
      accessToken: result.accessToken,
      accountId: result.accountId,
      role: result.role,
    };
  }
}
