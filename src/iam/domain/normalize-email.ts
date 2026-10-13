/**
 * Emails are case-insensitive and stored trimmed and lowercase, so `Ana@X.com`
 * and `ana@x.com` are one account. Every path that stores or looks up an email
 * (login, signup, admin creation, the seed) goes through this one function.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
