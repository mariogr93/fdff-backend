import {
  DEFAULT_DEV_ORIGIN,
  isBareOrigin,
  parseAllowedOrigins,
  resolveAllowedOrigins,
} from './allowed-origins';

describe('parseAllowedOrigins', () => {
  it('splits on commas and trims each entry', () => {
    expect(
      parseAllowedOrigins(' https://a.test , https://b.test:8443 '),
    ).toEqual(['https://a.test', 'https://b.test:8443']);
  });

  it('drops empty entries', () => {
    expect(parseAllowedOrigins('https://a.test,, ,')).toEqual([
      'https://a.test',
    ]);
  });

  it.each([undefined, '', '   ', ','])('gives an empty list for %j', (raw) => {
    expect(parseAllowedOrigins(raw)).toEqual([]);
  });
});

describe('isBareOrigin', () => {
  it.each([
    'https://app.fdff.test',
    'http://localhost:5173',
    'https://app.fdff.test:8443',
    'http://127.0.0.1:5173',
    'http://[::1]:5173',
  ])('accepts %s', (value) => {
    expect(isBareOrigin(value)).toBe(true);
  });

  it.each([
    '*',
    'app.fdff.test',
    'https://app.fdff.test/',
    'https://app.fdff.test/path',
    'https://app.fdff.test?x=1',
    'https://APP.fdff.test',
    'https://app.fdff.test:443',
    'ftp://app.fdff.test',
    'javascript:alert(1)',
    'https://*.fdff.test',
    'https://app_fdff.test',
    'https://-bad.test',
    '',
  ])('rejects %j', (value) => {
    expect(isBareOrigin(value)).toBe(false);
  });
});

describe('resolveAllowedOrigins', () => {
  it('uses the configured list', () => {
    expect(resolveAllowedOrigins('https://a.test,https://b.test')).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });

  it('falls back to the dev origin only when nothing is configured', () => {
    expect(resolveAllowedOrigins(undefined)).toEqual([DEFAULT_DEV_ORIGIN]);
    expect(resolveAllowedOrigins('')).toEqual([DEFAULT_DEV_ORIGIN]);
  });
});
