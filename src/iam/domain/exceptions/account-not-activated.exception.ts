import { DomainException } from '../../../shared/domain/domain.exception';

export class AccountNotActivatedException extends DomainException {
  constructor() {
    super(
      'This account is not activated. Only active accounts can sign in.',
      401,
    );
  }
}
