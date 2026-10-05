import { DomainException } from '../../../shared/domain/domain.exception';

export class ForbiddenRoleException extends DomainException {
  constructor() {
    super('You are not authorized to access this resource.', 403);
  }
}
