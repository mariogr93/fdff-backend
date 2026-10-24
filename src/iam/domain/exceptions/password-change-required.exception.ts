import { DomainException } from '../../../shared/domain/domain.exception';

export class PasswordChangeRequiredException extends DomainException {
  constructor() {
    super('You must change your password before using this resource.', 403);
  }
}
