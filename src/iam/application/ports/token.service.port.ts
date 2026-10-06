export const I_TOKEN_SERVICE = Symbol('I_TOKEN_SERVICE');

export interface AuthTokens {
  accessToken: string;
}

/**
 * What goes into an access token: deliberately not a domain Account, so no
 * password hash, role or status is ever serialised into a JWT.
 */
export interface TokenIdentity {
  id: string;
  email: string;
}

export interface ITokenServicePort {
  sign(identity: TokenIdentity): Promise<AuthTokens>;
}
