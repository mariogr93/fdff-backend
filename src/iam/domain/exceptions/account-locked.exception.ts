import { DomainException } from './domain.exception';

export class AccountLockedException extends DomainException {
  constructor() {
    super(
      'This account is temporarily locked due to too many failed login attempts. Try again later.',
      423,
    );
  }
}
