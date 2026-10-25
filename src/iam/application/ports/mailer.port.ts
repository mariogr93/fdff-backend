export const I_MAILER = Symbol('I_MAILER');

export interface TemporaryPasswordMail {
  to: string;
  temporaryPassword: string;
  /** Null when the temporary password never expires. */
  expiresAt: Date | null;
}

/**
 * Outgoing mail. The only adapter today is the development outbox; a real
 * provider replaces it (NEXT-FEATURES, "Email provider").
 */
export interface IMailerPort {
  sendTemporaryPassword(mail: TemporaryPasswordMail): Promise<void>;
}
