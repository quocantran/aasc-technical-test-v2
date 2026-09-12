import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppLogger } from '../logger/app-logger.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@Optional() private readonly logger?: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();


    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      typeof (exception as any)?.getStatus === 'function'
        ? (exception as any).getStatus()
        : (exception as any)?.status || HttpStatus.INTERNAL_SERVER_ERROR;

    const isProduction = process.env.NODE_ENV === 'production';
    let clientMessage: any;

    if (exception instanceof HttpException) {
      clientMessage = exception.getResponse();
    } else if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      clientMessage = isProduction ? 'Internal server error' : ((exception as any)?.message || 'Internal server error');
    } else {
      clientMessage = (exception as any)?.message || 'An error occurred';
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request?.url || '',
      method: request?.method || '',
      error: typeof clientMessage === 'object' ? clientMessage : { message: clientMessage },
    };


    this.logger?.error(
      `[HTTP ${status}] ${request.method} ${request.url} - ${JSON.stringify(errorResponse.error)}`,
      (exception as any)?.stack,
      'HttpExceptionFilter',
    );

    response.status(status).json(errorResponse);
  }
}

