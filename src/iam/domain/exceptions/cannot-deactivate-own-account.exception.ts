import { DomainException } from '../../../shared/domain/domain.exception';

export class CannotDeactivateOwnAccountException extends DomainException {
  constructor() {
    super('You cannot deactivate your own account.', 409);
  }
}
