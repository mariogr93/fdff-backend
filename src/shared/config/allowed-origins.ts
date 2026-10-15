/** Used only when FRONTEND_URL is unset, which validateEnv forbids in production. */
export const DEFAULT_DEV_ORIGIN = 'http://localhost:5173';

/** Splits a comma-separated FRONTEND_URL into trimmed, non-empty entries. */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const HOSTNAME =
  /^([a-z0-9]([a-z0-9-]*[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
const IPV6_HOSTNAME = /^\[[0-9a-f:]+\]$/;

/**
 * A bare origin is exactly what a browser sends in the Origin header: scheme,
 * host and optional non-default port. A path, a trailing slash, a wildcard, an
 * upper-case host or a default port (`:443`) would never match, so they are
 * rejected here rather than failing silently at request time.
 *
 * The hostname is checked against a plain allowlist as well, because the URL
 * parser accepts characters such as `*` in a host (`https://*.fdff.test`).
 */
export function isBareOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value &&
      (HOSTNAME.test(url.hostname) || IPV6_HOSTNAME.test(url.hostname))
    );
  } catch {
    return false;
  }
}

/** The CORS allowlist for this process: FRONTEND_URL, or the dev origin if unset. */
export function resolveAllowedOrigins(raw: string | undefined): string[] {
  const origins = parseAllowedOrigins(raw);
  return origins.length > 0 ? origins : [DEFAULT_DEV_ORIGIN];
}
