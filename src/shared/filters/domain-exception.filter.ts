import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainException } from '../../iam/domain/exceptions/domain.exception';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    response.status(exception.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: exception.statusCode,
      message: exception.message,
      error: exception.name,
    });
  }
}
