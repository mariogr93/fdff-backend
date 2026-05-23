import { DomainException } from './domain.exception';

export class AccountNotApprovedException extends DomainException {
  constructor() {
    super(
      'This account is not active. Only approved accounts can sign in.',
      401,
    );
  }
}
