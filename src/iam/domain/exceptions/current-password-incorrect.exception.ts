import { DomainException } from '../../../shared/domain/domain.exception';

/**
 * A 400, not a 401: the caller holds a valid session, and a 401 would make the
 * client treat the session as expired.
 */
export class CurrentPasswordIncorrectException extends DomainException {
  constructor() {
    super('The current password is incorrect.', 400);
  }
}
