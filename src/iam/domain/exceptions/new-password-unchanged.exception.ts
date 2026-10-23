import { DomainException } from '../../../shared/domain/domain.exception';

export class NewPasswordUnchangedException extends DomainException {
  constructor() {
    super('The new password must differ from the current one.', 400);
  }
}
