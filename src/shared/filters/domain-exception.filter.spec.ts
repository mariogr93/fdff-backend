import { ArgumentsHost } from '@nestjs/common';
import { AccountAlreadyExistsException } from '../../iam/domain/exceptions/account-already-exists.exception';
import { AccountLockedException } from '../../iam/domain/exceptions/account-locked.exception';
import { AccountNotActivatedException } from '../../iam/domain/exceptions/account-not-activated.exception';
import { AccountNotFoundException } from '../../iam/domain/exceptions/account-not-found.exception';
import { ForbiddenRoleAssignmentException } from '../../iam/domain/exceptions/forbidden-role-assignment.exception';
import { ForbiddenRoleException } from '../../iam/domain/exceptions/forbidden-role.exception';
import { InvalidCredentialsException } from '../../iam/domain/exceptions/invalid-credentials.exception';
import { InvalidRefreshTokenException } from '../../iam/domain/exceptions/invalid-refresh-token.exception';
import { DomainException } from '../domain/domain.exception';
import { DomainExceptionFilter } from './domain-exception.filter';

const mockHost = () => {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response };
};

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  it('maps a domain exception onto its own status code', () => {
    const { host, response } = mockHost();

    const exception = new AccountLockedException();

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(423);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 423,
      message: exception.message,
      error: 'AccountLockedException',
    });
  });

  it('falls back to 500 when no status code was given', () => {
    const { host, response } = mockHost();

    filter.catch(new DomainException('something broke'), host);

    expect(response.status).toHaveBeenCalledWith(500);
  });

  /**
   * @Catch(DomainException) matches on class identity, so a second copy of the
   * base class would make the filter silently stop catching these — every
   * domain error would become a 500 with a leaked stack trace. This asserts
   * they all still resolve to the one class in the shared kernel.
   */
  describe('class identity across the shared kernel boundary', () => {
    const exceptions = [
      new AccountAlreadyExistsException('a@fdff.test'),
      new AccountLockedException(),
      new AccountNotActivatedException(),
      new AccountNotFoundException(),
      new ForbiddenRoleAssignmentException(),
      new ForbiddenRoleException(),
      new InvalidCredentialsException(),
      new InvalidRefreshTokenException(),
    ];

    it.each(exceptions.map((e) => [e.constructor.name, e] as const))(
      '%s is an instance of the shared DomainException',
      (_name, exception) => {
        expect(exception).toBeInstanceOf(DomainException);
      },
    );

    it('every exception carries a non-500 status code', () => {
      for (const exception of exceptions) {
        expect(exception.statusCode).toBeGreaterThanOrEqual(400);
        expect(exception.statusCode).toBeLessThan(500);
      }
    });
  });
});
