import { DomainException } from '../../../shared/domain/domain.exception';

/** Told only to someone who proved the temporary password: the account is now inactive. */
export class TemporaryPasswordAlreadyUsedException extends DomainException {
  constructor() {
    super(
      'The temporary password was already used and the password was not changed. The account has been deactivated; ask an administrator to reactivate it.',
      401,
    );
  }
}
