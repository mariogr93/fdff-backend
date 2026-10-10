import { IRefreshTokenServicePort } from '../application/ports/refresh-token.port';

/** Deterministic stand-in: tokens are 64 chars, and hash(x) never equals x. */
export class FakeRefreshTokenService implements IRefreshTokenServicePort {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `token-${this.counter}`.padEnd(64, '0');
  }

  hash(token: string): string {
    return `hash:${token}`;
  }
}
