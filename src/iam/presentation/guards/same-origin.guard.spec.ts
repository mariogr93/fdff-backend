import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CrossOriginRequestException } from '../../domain/exceptions/cross-origin-request.exception';
import { SameOriginGuard } from './same-origin.guard';

const FIRST = 'https://app.fdff.test';
const SECOND = 'https://admin.fdff.test';

const guardFor = (frontendUrl: string | undefined) =>
  new SameOriginGuard({
    get: () => frontendUrl,
  } as unknown as ConfigService);

const contextWith = (headers: Record<string, string>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

describe('SameOriginGuard', () => {
  const guard = guardFor(`${FIRST}, ${SECOND}`);

  it.each([FIRST, SECOND])('allows the allowed origin %s', (origin) => {
    expect(guard.canActivate(contextWith({ origin }))).toBe(true);
  });

  it.each([
    'https://evil.test',
    'null',
    `${FIRST}.evil.test`,
    `${FIRST}/`,
    'http://app.fdff.test',
  ])('rejects the origin %s', (origin) => {
    expect(() => guard.canActivate(contextWith({ origin }))).toThrow(
      CrossOriginRequestException,
    );
  });

  it('trusts the Origin allowlist over Sec-Fetch-Site', () => {
    // A deployment that is cross-site on purpose lists its SPA in FRONTEND_URL.
    expect(
      guard.canActivate(
        contextWith({ origin: FIRST, 'sec-fetch-site': 'cross-site' }),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        contextWith({
          origin: 'https://evil.test',
          'sec-fetch-site': 'same-origin',
        }),
      ),
    ).toThrow(CrossOriginRequestException);
  });

  it('rejects a browser request marked cross-site when it sends no Origin', () => {
    expect(() =>
      guard.canActivate(contextWith({ 'sec-fetch-site': 'cross-site' })),
    ).toThrow(CrossOriginRequestException);
  });

  it.each(['same-origin', 'same-site', 'none'])(
    'allows a request without Origin and with Sec-Fetch-Site: %s',
    (site) => {
      expect(guard.canActivate(contextWith({ 'sec-fetch-site': site }))).toBe(
        true,
      );
    },
  );

  it('allows a request with neither header (curl, a server)', () => {
    expect(guard.canActivate(contextWith({}))).toBe(true);
  });

  it('allows the Vite dev server when FRONTEND_URL is unset', () => {
    const dev = guardFor(undefined);

    expect(
      dev.canActivate(contextWith({ origin: 'http://localhost:5173' })),
    ).toBe(true);
    expect(() => dev.canActivate(contextWith({ origin: FIRST }))).toThrow(
      CrossOriginRequestException,
    );
  });
});
