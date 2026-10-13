import { normalizeEmail } from './normalize-email';

describe('normalizeEmail', () => {
  it('lowercases', () => {
    expect(normalizeEmail('Ana@FDFF.test')).toBe('ana@fdff.test');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  ana@fdff.test \n')).toBe('ana@fdff.test');
  });

  it('is idempotent', () => {
    const once = normalizeEmail(' Ana@FDFF.test ');
    expect(normalizeEmail(once)).toBe(once);
  });
});
