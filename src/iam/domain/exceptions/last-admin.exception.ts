import { DomainException } from '../../../shared/domain/domain.exception';

export class LastAdminException extends DomainException {
  constructor() {
    super('At least one active administrator must remain.', 409);
  }
}
