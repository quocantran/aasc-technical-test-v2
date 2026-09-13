import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { AppLogger } from '../logger/app-logger.service';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  constructor(@Optional() private readonly logger?: AppLogger) {}

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Database error';

    switch (exception.code) {
      case 'P2002': {
        status = HttpStatus.CONFLICT;
        const target = (exception.meta?.target as string[])?.join(', ') || 'fields';
        message = `Unique constraint violation on: ${target}`;
        break;
      }
      case 'P2025': {
        status = HttpStatus.NOT_FOUND;
        message = (exception.meta?.cause as string) || 'Record not found';
        break;
      }
      case 'P2023': {
        status = HttpStatus.BAD_REQUEST;
        message = 'Invalid parameter or identifier format (expected valid UUID)';
        break;
      }
      case 'P2000': {
        status = HttpStatus.BAD_REQUEST;
        message = 'The provided value is too long for the column';
        break;
      }
      case 'P2003': {
        status = HttpStatus.BAD_REQUEST;
        message = 'Foreign key constraint violation';
        break;
      }
      default:
        message = `Database error code: ${exception.code}`;
        break;
    }

    this.logger?.warn(`Prisma error [${exception.code}]: ${message}`, 'PrismaFilter');

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      message,
      code: exception.code,
    });
  }
}

