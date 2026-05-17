import { DomainException } from './domain.exception';

export class AccountAlreadyExistsException extends DomainException {
  constructor(email: string) {
    super(`An account with the email '${email}' already exists in the federation.`, 400);
  }
}