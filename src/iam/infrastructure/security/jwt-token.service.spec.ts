import { generateKeyPairSync } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtTokenService } from './jwt-token.service';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const config = {
  get: (key: string, fallback?: string) =>
    ({ JWT_PRIVATE_KEY: privateKey, JWT_PUBLIC_KEY: publicKey })[key] ??
    fallback,
} as unknown as ConfigService;

describe('JwtTokenService', () => {
  const jwt = new JwtService({});
  const service = new JwtTokenService(jwt, config);

  it('signs an RS256 token whose claims are identity and token version only', async () => {
    const { accessToken } = await service.sign({
      id: 'acc-1',
      email: 'a@fdff.test',
      tokenVersion: 7,
    });

    const payload = await jwt.verifyAsync<Record<string, unknown>>(
      accessToken,
      { publicKey, algorithms: ['RS256'] },
    );

    expect(payload).toMatchObject({
      sub: 'acc-1',
      email: 'a@fdff.test',
      tv: 7,
    });
    // Role and status are re-read from the database on every request.
    expect(Object.keys(payload).sort()).toEqual([
      'email',
      'exp',
      'iat',
      'sub',
      'tv',
    ]);
  });
});
