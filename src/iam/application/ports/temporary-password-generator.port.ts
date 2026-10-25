export const I_TEMPORARY_PASSWORD_GENERATOR = Symbol(
  'I_TEMPORARY_PASSWORD_GENERATOR',
);

export interface ITemporaryPasswordGeneratorPort {
  /** A new random one-time password, readable when copied by hand. */
  generate(): string;
}
