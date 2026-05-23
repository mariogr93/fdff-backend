import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import {
  AuthTokens,
  ITokenServicePort,
  TokenIdentity,
} from '../../application/ports/token.service.port';
import { Account } from '../../domain/account.model';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtTokenService implements ITokenServicePort {
  private readonly jwtSecret: string;
  private readonly expiresIn: JwtSignOptions['expiresIn'];

  constructor(
    private readonly jwtService: JwtService,
    config: ConfigService,
  ) {
    this.jwtSecret = config.getOrThrow<string>('JWT_SECRET');
    this.expiresIn = config.get<string>(
      'JWT_EXPIRES_IN',
      '15m',
    ) as JwtSignOptions['expiresIn'];
  }

  async sign(identity: TokenIdentity): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: identity.id,
      email: identity.email,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.jwtSecret,
      expiresIn: this.expiresIn,
    });

    return { accessToken };
  }

  async verify(token: string): Promise<TokenIdentity> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.jwtSecret,
      });

      return {
        id: payload.sub,
        email: payload.email,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }
  }
}
