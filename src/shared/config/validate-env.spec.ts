import { validateEnv } from './validate-env';

const valid = {
  DB_HOST: 'localhost',
  DB_USER: 'user',
  DB_PASSWORD: 'secret-value',
  DB_NAME: 'fdff',
  NODE_ENV: 'development',
};

describe('validateEnv', () => {
  it('accepts a complete environment', () => {
    expect(validateEnv(valid)).toBe(valid);
  });

  it.each(['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'NODE_ENV'])(
    'rejects a missing %s',
    (name) => {
      const env: Record<string, unknown> = { ...valid };
      delete env[name];
      expect(() => validateEnv(env)).toThrow(name);
    },
  );

  it('rejects a blank required value', () => {
    expect(() => validateEnv({ ...valid, DB_PASSWORD: '   ' })).toThrow(
      'DB_PASSWORD',
    );
  });

  it.each(['prod', 'staging', ''])('rejects NODE_ENV=%j', (value) => {
    expect(() => validateEnv({ ...valid, NODE_ENV: value })).toThrow(
      'NODE_ENV',
    );
  });

  it.each(['development', 'production', 'test'])('accepts NODE_ENV=%s', (v) => {
    expect(() => validateEnv({ ...valid, NODE_ENV: v })).not.toThrow();
  });

  it.each(['DB_PORT', 'SALT_ROUNDS', 'REFRESH_TOKEN_EXPIRES_DAYS'])(
    'rejects a non-numeric, zero or negative %s',
    (name) => {
      for (const bad of ['abc', '0', '-1', '1.5', '7d']) {
        expect(() => validateEnv({ ...valid, [name]: bad })).toThrow(name);
      }
    },
  );

  it('allows the optional numbers to be unset', () => {
    expect(() => validateEnv({ ...valid, SALT_ROUNDS: '12' })).not.toThrow();
  });

  it('never includes values in the error', () => {
    expect(() =>
      validateEnv({ ...valid, DB_PASSWORD: '', SALT_ROUNDS: 'hunter2' }),
    ).toThrow(/^(?!.*hunter2)/);
  });
});
