import { DomainException } from '../../../shared/domain/domain.exception';

export class AccountAlreadyActiveException extends DomainException {
  constructor() {
    super('This account is already active.', 409);
  }
}
