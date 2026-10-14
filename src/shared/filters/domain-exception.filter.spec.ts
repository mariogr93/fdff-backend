import { ArgumentsHost } from '@nestjs/common';
import { DomainException } from '../domain/domain.exception';
import { DomainExceptionFilter } from './domain-exception.filter';

/** A local stand-in, so the shared kernel's spec imports no slice. Each slice
 *  checks its own exceptions against DomainException in its own
 *  domain/exceptions/exceptions.spec.ts. */
class LockedTestException extends DomainException {
  constructor() {
    super('Locked for the test.', 423);
  }
}

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

    const exception = new LockedTestException();

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(423);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 423,
      message: exception.message,
      error: 'LockedTestException',
    });
  });

  it('falls back to 500 when no status code was given', () => {
    const { host, response } = mockHost();

    filter.catch(new DomainException('something broke'), host);

    expect(response.status).toHaveBeenCalledWith(500);
  });
});
