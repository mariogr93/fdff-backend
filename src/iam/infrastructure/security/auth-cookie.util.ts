import { CookieOptions } from 'express';

export const REFRESH_TOKEN_COOKIE = 'refresh_token';

export function buildRefreshTokenCookieOptions(
  maxAgeMs: number,
  isProduction: boolean,
): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: maxAgeMs,
  };
}
