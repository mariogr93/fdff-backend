import { CookieOptions } from 'express';

export const REFRESH_TOKEN_COOKIE = 'refresh_token';

export function buildRefreshTokenCookieOptions(
  maxAgeMs: number,
  secure: boolean,
): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: maxAgeMs,
  };
}

export function buildClearRefreshTokenCookieOptions(
  secure: boolean,
): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/api/auth',
  };
}
