export const I_PASSWORD_HASHER = Symbol('I_PASSWORD_HASHER');

export interface IPasswordHasherPort {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
}
