import {
  Body,
  Controller,
  Inject,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  type AuthPolicy,
  I_AUTH_POLICY,
} from '../application/ports/auth-policy';
import type { Request, Response } from 'express';
import { LoginAccountUseCase } from '../application/use-cases/login-account.use-case';
import { RefreshAccountUseCase } from '../application/use-cases/refresh-account.use-case';
import { RegisterAccountUseCase } from '../application/use-cases/register-account.use-case';
import {
  buildRefreshTokenCookieOptions,
  buildClearRefreshTokenCookieOptions,
  REFRESH_TOKEN_COOKIE,
} from '../infrastructure/security/auth-cookie.util';
import { LoginDto } from './dtos/login.dto';
import { RegisterAccountDto } from './dtos/register-account.dto';
import { LogoutAccountUseCase } from '../application/use-cases/logout-account.use-case';

/** cookie-parser types req.cookies as `any`; narrow it in one place. */
const readRefreshCookie = (req: Request): string | undefined => {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[REFRESH_TOKEN_COOKIE];
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerAccount: RegisterAccountUseCase,
    private readonly loginAccount: LoginAccountUseCase,
    private readonly logoutAccount: LogoutAccountUseCase,
    private readonly refreshAccount: RefreshAccountUseCase,
    private readonly config: ConfigService,
    @Inject(I_AUTH_POLICY)
    private readonly policy: AuthPolicy,
  ) {}

  // Public and unauthenticated. It needs no role guard because the use case
  // cannot create anything but a PENDING ATHLETE.
  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  async register(@Body() dto: RegisterAccountDto) {
    const account = await this.registerAccount.execute({
      email: dto.email,
      plainPassword: dto.password,
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
        this.policy.refreshTokenTtlMs,
        isProduction,
      ),
    );

    return {
      accessToken: result.accessToken,
      accountId: result.accountId,
      role: result.role,
    };
  }

  @Post('logout')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.logoutAccount.execute(readRefreshCookie(req));

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    res.clearCookie(
      REFRESH_TOKEN_COOKIE,
      buildClearRefreshTokenCookieOptions(isProduction),
    );

    return;
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const plainRefreshToken = readRefreshCookie(req);
    if (!plainRefreshToken) {
      throw new UnauthorizedException('Refresh token cookie is missing.');
    }

    const result = await this.refreshAccount.execute(plainRefreshToken);
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    res.cookie(
      REFRESH_TOKEN_COOKIE,
      result.refreshToken,
      buildRefreshTokenCookieOptions(
        this.policy.refreshTokenTtlMs,
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
