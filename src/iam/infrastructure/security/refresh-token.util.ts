import { createHash, randomBytes } from 'crypto';

const REFRESH_TOKEN_BYTES = 48;

export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

/** One-way hash before persisting — never store the raw refresh token. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
