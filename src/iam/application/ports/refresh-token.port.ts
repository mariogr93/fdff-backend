export const I_REFRESH_TOKEN_SERVICE = Symbol('I_REFRESH_TOKEN_SERVICE');

export interface IRefreshTokenServicePort {
  /** A new random opaque token. Only its hash may ever be persisted. */
  generate(): string;
  /** One-way hash of a token, for storage and lookup. */
  hash(token: string): string;
}
