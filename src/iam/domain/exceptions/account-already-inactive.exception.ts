import { DomainException } from '../../../shared/domain/domain.exception';

export class AccountAlreadyInactiveException extends DomainException {
  constructor() {
    super('This account is already inactive.', 409);
  }
}
