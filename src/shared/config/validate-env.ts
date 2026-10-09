const REQUIRED = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const;
const POSITIVE_INTEGERS = [
  'DB_PORT',
  'SALT_ROUNDS',
  'REFRESH_TOKEN_EXPIRES_DAYS',
] as const;
const ENVIRONMENTS = ['development', 'production', 'test'];

/**
 * Fails startup on a broken environment instead of running with a guessable
 * default. Reports variable names only, never values.
 */
export function validateEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const problems: string[] = [];

  for (const name of REQUIRED) {
    if (!isNonEmptyString(env[name])) problems.push(`${name} is required`);
  }

  if (
    typeof env.NODE_ENV !== 'string' ||
    !ENVIRONMENTS.includes(env.NODE_ENV)
  ) {
    problems.push(`NODE_ENV must be one of: ${ENVIRONMENTS.join(', ')}`);
  }

  for (const name of POSITIVE_INTEGERS) {
    const value = env[name];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
      problems.push(`${name} must be a positive integer`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment: ${problems.join('; ')}`);
  }
  return env;
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}
