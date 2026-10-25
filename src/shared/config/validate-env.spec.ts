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

  it.each(['development', 'test'])('accepts NODE_ENV=%s', (v) => {
    expect(() =>
      validateEnv({
        ...valid,
        NODE_ENV: v,
        FRONTEND_URL: 'https://app.fdff.test',
      }),
    ).not.toThrow();
  });

  it('accepts NODE_ENV=production itself; only the missing mail provider fails', () => {
    expect(() =>
      validateEnv({
        ...valid,
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://app.fdff.test',
      }),
    ).toThrow(/^(?!.*NODE_ENV).*MAIL_DRIVER/);
  });

  describe('MAIL_DRIVER', () => {
    it.each([undefined, '', 'outbox'])(
      'accepts %j outside production',
      (MAIL_DRIVER) => {
        for (const NODE_ENV of ['development', 'test']) {
          expect(() =>
            validateEnv({ ...valid, NODE_ENV, MAIL_DRIVER }),
          ).not.toThrow();
        }
      },
    );

    it.each(['smtp', 'Outbox', 'console'])('rejects the unknown %j', (v) => {
      expect(() => validateEnv({ ...valid, MAIL_DRIVER: v })).toThrow(
        'MAIL_DRIVER',
      );
    });

    it.each([undefined, 'outbox'])(
      'refuses production with %j: no real provider exists yet',
      (MAIL_DRIVER) => {
        expect(() =>
          validateEnv({
            ...valid,
            NODE_ENV: 'production',
            FRONTEND_URL: 'https://app.fdff.test',
            MAIL_DRIVER,
          }),
        ).toThrow('MAIL_DRIVER');
      },
    );
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

  describe('FRONTEND_URL', () => {
    it.each(['development', 'test'])(
      'may be unset when NODE_ENV=%s',
      (NODE_ENV) => {
        expect(() => validateEnv({ ...valid, NODE_ENV })).not.toThrow();
      },
    );

    it.each([undefined, '', '   '])(
      'is required in production, rejecting %j',
      (FRONTEND_URL) => {
        expect(() =>
          validateEnv({ ...valid, NODE_ENV: 'production', FRONTEND_URL }),
        ).toThrow('FRONTEND_URL');
      },
    );

    it.each([
      'https://app.fdff.test',
      'https://app.fdff.test,https://admin.fdff.test:8443',
      ' https://app.fdff.test , http://localhost:5173 ',
    ])('accepts %j in production', (FRONTEND_URL) => {
      // Production still fails on MAIL_DRIVER until a provider exists; the
      // point here is that FRONTEND_URL is not among the problems.
      expect(() =>
        validateEnv({ ...valid, NODE_ENV: 'production', FRONTEND_URL }),
      ).not.toThrow('FRONTEND_URL');
    });

    it.each([
      '*',
      'app.fdff.test',
      'https://app.fdff.test/',
      'https://app.fdff.test/login',
      'https://app.fdff.test,*',
      'https://app.fdff.test,app.fdff.test',
      ',',
    ])('rejects %j in every environment', (FRONTEND_URL) => {
      for (const NODE_ENV of ['development', 'production', 'test']) {
        expect(() => validateEnv({ ...valid, NODE_ENV, FRONTEND_URL })).toThrow(
          'FRONTEND_URL',
        );
      }
    });

    it('never includes the value in the error', () => {
      expect(() =>
        validateEnv({ ...valid, FRONTEND_URL: 'https://leak-me.test/path' }),
      ).toThrow(/^(?!.*leak-me)/);
    });
  });

  it('never includes values in the error', () => {
    expect(() =>
      validateEnv({ ...valid, DB_PASSWORD: '', SALT_ROUNDS: 'hunter2' }),
    ).toThrow(/^(?!.*hunter2)/);
  });
});
