import { DomainException } from './domain.exception';

export class ForbiddenRoleException extends DomainException {
  constructor() {
    super(
      'You are not authorized to access this resource.',
      403,
    );
  }
}
