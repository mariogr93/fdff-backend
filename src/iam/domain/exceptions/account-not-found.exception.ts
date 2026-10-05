import { DomainException } from '../../../shared/domain/domain.exception';

export class AccountNotFoundException extends DomainException {
  constructor() {
    super('Account not found.', 404);
  }
}
