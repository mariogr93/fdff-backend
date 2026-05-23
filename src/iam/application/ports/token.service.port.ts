import { Account } from '../../domain/account.model';

export const I_TOKEN_SERVICE = Symbol('I_TOKEN_SERVICE');

export interface AuthTokens {
  accessToken: string;
}

/** Verified token identity — not a domain Account (no password, role, or status). */
export interface TokenIdentity {
  id: string;
  email: string;
}

export interface ITokenServicePort {
  sign(identity: TokenIdentity): Promise<AuthTokens>;
  verify(token: string): Promise<TokenIdentity>;
}
