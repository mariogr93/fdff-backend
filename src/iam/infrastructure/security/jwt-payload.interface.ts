/** Immutable claims stored in the access token (identity only). */
export interface JwtPayload {
  sub: string;
  email: string;
}
