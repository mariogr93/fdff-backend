import { DomainException } from '../../../shared/domain/domain.exception';

export class ForbiddenRoleAssignmentException extends DomainException {
  constructor() {
    super('Only an ADMIN can create ADMIN or JUDGE accounts.', 403);
  }
}
