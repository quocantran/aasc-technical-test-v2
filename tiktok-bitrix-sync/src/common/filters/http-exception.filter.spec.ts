import { AllExceptionsFilter } from './http-exception.filter';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AppLogger } from '../logger/app-logger.service';

describe('AllExceptionsFilter', () => {
  it('should catch HttpException and format JSON response', () => {
    const mockLogger = {
      error: jest.fn(),
    } as any as AppLogger;

    const filter = new AllExceptionsFilter(mockLogger);

    const jsonFn = jest.fn();
    const statusFn = jest.fn().mockReturnValue({ json: jsonFn });

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusFn }),
        getRequest: () => ({ method: 'GET', url: '/api/test' }),
      }),
    } as any;

    const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    filter.catch(exception, host);

    expect(statusFn).toHaveBeenCalledWith(403);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        path: '/api/test',
        method: 'GET',
        error: { message: 'Forbidden' },
      }),
    );
  });

  it('should format HttpException with object response', () => {
    const filter = new AllExceptionsFilter();
    const jsonFn = jest.fn();
    const statusFn = jest.fn().mockReturnValue({ json: jsonFn });

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusFn }),
        getRequest: () => ({ method: 'POST', url: '/api/items' }),
      }),
    } as any;

    const exception = new HttpException({ error: 'Bad', code: 1 }, HttpStatus.BAD_REQUEST);
    filter.catch(exception, host);

    expect(statusFn).toHaveBeenCalledWith(400);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: { error: 'Bad', code: 1 },
      }),
    );
  });

  it('should handle generic 500 error in development mode', () => {
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const mockLogger = { error: jest.fn() } as any;
    const filter = new AllExceptionsFilter(mockLogger);

    const jsonFn = jest.fn();
    const statusFn = jest.fn().mockReturnValue({ json: jsonFn });

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusFn }),
        getRequest: () => ({ method: 'GET', url: '/api/error' }),
      }),
    } as any;

    filter.catch(new Error('Internal database breakdown'), host);

    expect(statusFn).toHaveBeenCalledWith(500);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: { message: 'Internal database breakdown' },
      }),
    );

    process.env.NODE_ENV = oldEnv;
  });

  it('should sanitize 500 error message in production mode', () => {
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const filter = new AllExceptionsFilter();
    const jsonFn = jest.fn();
    const statusFn = jest.fn().mockReturnValue({ json: jsonFn });

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusFn }),
        getRequest: () => ({ method: 'GET', url: '/api/error' }),
      }),
    } as any;

    filter.catch(new Error('Secret DB error'), host);

    expect(statusFn).toHaveBeenCalledWith(500);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: { message: 'Internal server error' },
      }),
    );

    process.env.NODE_ENV = oldEnv;
  });

  it('should handle custom status error with status < 500 without getStatus function', () => {
    const filter = new AllExceptionsFilter();
    const jsonFn = jest.fn();
    const statusFn = jest.fn().mockReturnValue({ json: jsonFn });

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusFn }),
        getRequest: () => ({}),
      }),
    } as any;

    filter.catch({ status: 422, message: 'Unprocessable' }, host);

    expect(statusFn).toHaveBeenCalledWith(422);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        path: '',
        method: '',
        error: { message: 'Unprocessable' },
      }),
    );
  });

  it('should handle custom status error without message', () => {
    const filter = new AllExceptionsFilter();
    const jsonFn = jest.fn();
    const statusFn = jest.fn().mockReturnValue({ json: jsonFn });

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusFn }),
        getRequest: () => ({}),
      }),
    } as any;

    filter.catch({ status: 404 }, host);

    expect(statusFn).toHaveBeenCalledWith(404);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        error: { message: 'An error occurred' },
      }),
    );
  });
});

