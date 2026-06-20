import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import {
  AuthTokens,
  ITokenServicePort,
  TokenIdentity,
} from '../../application/ports/token.service.port';
import { JwtPayload } from './jwt-payload.interface';
import { loadJwtKeyPair } from './jwt-key.util';

@Injectable()
export class JwtTokenService implements ITokenServicePort {
  private readonly privateKey: string;
  private readonly publicKey: string;
  private readonly expiresIn: JwtSignOptions['expiresIn'];

  constructor(
    private readonly jwtService: JwtService,
    config: ConfigService,
  ) {
    const keys = loadJwtKeyPair(config);
    this.privateKey = keys.privateKey;
    this.publicKey = keys.publicKey;
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
      privateKey: this.privateKey,
      algorithm: 'RS256',
      expiresIn: this.expiresIn,
    });

    return { accessToken };
  }

  async verify(token: string): Promise<TokenIdentity> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        publicKey: this.publicKey,
        algorithms: ['RS256'],
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
