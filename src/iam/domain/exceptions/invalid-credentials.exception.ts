import { DomainException } from '../../../shared/domain/domain.exception';

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super('The email or password provided is incorrect.', 401);
  }
}
