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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { REFRESH_COOKIE_AUTH } from '../../shared/http/setup-openapi';
import { AccountResponseDto } from './dtos/account-response.dto';
import { AuthSessionResponseDto } from './dtos/auth-session-response.dto';
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
import { SameOriginGuard } from './guards/same-origin.guard';

/** cookie-parser types req.cookies as `any`; narrow it in one place. */
const readRefreshCookie = (req: Request): string | undefined => {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  return cookies?.[REFRESH_TOKEN_COOKIE];
};

@ApiTags('auth')
@ApiForbiddenResponse({
  description: 'The request came from an origin not in FRONTEND_URL.',
})
@ApiUnsupportedMediaTypeResponse({
  description: 'The body was not application/json.',
})
@ApiTooManyRequestsResponse({ description: 'Rate limit for this route hit.' })
@Controller('auth')
@UseGuards(SameOriginGuard)
export class AuthController {
  constructor(
    private readonly registerAccount: RegisterAccountUseCase,
    private readonly loginAccount: LoginAccountUseCase,
    private readonly logoutAccount: LogoutAccountUseCase,
    private readonly refreshAccount: RefreshAccountUseCase,
    @Inject(I_AUTH_POLICY)
    private readonly policy: AuthPolicy,
  ) {}

  // Public and unauthenticated. It needs no role guard because the use case
  // cannot create anything but a PENDING ATHLETE.
  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @ApiOperation({
    summary:
      'Self-signup. Always creates a PENDING athlete an admin must activate.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid input, or the email is already registered.',
  })
  async register(@Body() dto: RegisterAccountDto): Promise<AccountResponseDto> {
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
  @ApiOperation({
    summary:
      'Sign in. Sets the HttpOnly refresh_token cookie (Path=/api/auth).',
  })
  @ApiUnauthorizedResponse({
    description:
      'Wrong email or password (one generic answer for both), or the account is not active.',
  })
  @ApiResponse({
    status: 423,
    description:
      'Locked after too many failed attempts; told only to someone with the right password.',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponseDto> {
    const result = await this.loginAccount.execute({
      email: dto.email,
      plainPassword: dto.password,
    });

    res.cookie(
      REFRESH_TOKEN_COOKIE,
      result.refreshToken,
      buildRefreshTokenCookieOptions(
        this.policy.refreshTokenTtlMs,
        this.policy.secureCookies,
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
  @ApiCookieAuth(REFRESH_COOKIE_AUTH)
  @ApiOperation({
    summary:
      'Ends the session: clears the cookie and revokes the access tokens already issued. Always 200.',
  })
  @ApiOkResponse({
    description: 'Signed out (also when there was no session).',
  })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.logoutAccount.execute(readRefreshCookie(req));

    res.clearCookie(
      REFRESH_TOKEN_COOKIE,
      buildClearRefreshTokenCookieOptions(this.policy.secureCookies),
    );

    return;
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE_AUTH)
  @ApiOperation({
    summary:
      'Exchanges the refresh_token cookie for a new access token and a rotated cookie.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Missing, expired, unknown or already-used refresh token (one answer for all).',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthSessionResponseDto> {
    const plainRefreshToken = readRefreshCookie(req);
    if (!plainRefreshToken) {
      throw new UnauthorizedException('Refresh token cookie is missing.');
    }

    const result = await this.refreshAccount.execute(plainRefreshToken);
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      result.refreshToken,
      buildRefreshTokenCookieOptions(
        this.policy.refreshTokenTtlMs,
        this.policy.secureCookies,
      ),
    );

    return {
      accessToken: result.accessToken,
      accountId: result.accountId,
      role: result.role,
    };
  }
}
