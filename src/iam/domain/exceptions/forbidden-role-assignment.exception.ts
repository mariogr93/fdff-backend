import { DomainException } from './domain.exception';

export class ForbiddenRoleAssignmentException extends DomainException {
  constructor() {
    super(
      'Only an ADMIN can create ADMIN or JUDGE accounts.',
      403,
    );
  }
}
