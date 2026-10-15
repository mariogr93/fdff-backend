import { DomainException } from '../../../shared/domain/domain.exception';

export class CrossOriginRequestException extends DomainException {
  constructor() {
    super('This request origin is not allowed.', 403);
  }
}
