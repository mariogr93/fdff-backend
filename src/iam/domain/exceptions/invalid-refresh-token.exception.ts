import { DomainException } from './domain.exception';

export class InvalidRefreshTokenException extends DomainException {
  constructor() {
    super('Refresh token is invalid or expired.', 401);
  }
}
