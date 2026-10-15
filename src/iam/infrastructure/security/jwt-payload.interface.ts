/**
 * Immutable claims stored in the access token. Identity plus `tv`, the
 * account's token version when it was issued; never role or status.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  tv: number;
}
