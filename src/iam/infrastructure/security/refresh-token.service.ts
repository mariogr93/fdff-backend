import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { IRefreshTokenServicePort } from '../../application/ports/refresh-token.port';

const REFRESH_TOKEN_BYTES = 48;

@Injectable()
export class RefreshTokenService implements IRefreshTokenServicePort {
  generate(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  /** One-way hash before persisting — never store the raw refresh token. */
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
