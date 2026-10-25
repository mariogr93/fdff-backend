import { CryptoTemporaryPasswordGenerator } from './crypto-temporary-password-generator';

describe('CryptoTemporaryPasswordGenerator', () => {
  const generator = new CryptoTemporaryPasswordGenerator();
  const samples = Array.from({ length: 500 }, () => generator.generate());

  it('makes 8-character passwords', () => {
    for (const password of samples) expect(password).toHaveLength(8);
  });

  it('meets the signup strength rule: upper, lower and a digit', () => {
    for (const password of samples) {
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
    }
  });

  it('has exactly one symbol', () => {
    for (const password of samples) {
      expect(password.replace(/[A-Za-z0-9]/g, '')).toHaveLength(1);
    }
  });

  it('leaves out look-alike characters', () => {
    for (const password of samples) expect(password).not.toMatch(/[IOlo01]/);
  });

  it('does not repeat itself', () => {
    expect(new Set(samples).size).toBe(samples.length);
  });

  it('does not always put the symbol in the same place', () => {
    const positions = new Set(
      samples.map((password) => password.search(/[^A-Za-z0-9]/)),
    );
    expect(positions.size).toBeGreaterThan(1);
  });
});
