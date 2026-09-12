import { PrismaClientExceptionFilter } from './prisma-client-exception.filter';
import { Prisma } from '@prisma/client';
import { AppLogger } from '../logger/app-logger.service';

describe('PrismaClientExceptionFilter', () => {
  it('should format P2002 unique constraint conflict into 409 status', () => {
    const mockLogger = { warn: jest.fn() } as any as AppLogger;
    const filter = new PrismaClientExceptionFilter(mockLogger);

    const jsonFn = jest.fn();
    const statusFn = jest.fn().mockReturnValue({ json: jsonFn });

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusFn }),
      }),
    } as any;

    const exception = new Prisma.PrismaClientKnownRequestError('Unique error', {
      code: 'P2002',
      clientVersion: '5.22.0',
      meta: { target: ['event_id'] },
    });

    filter.catch(exception, host);

    expect(statusFn).toHaveBeenCalledWith(409);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        code: 'P2002',
        message: 'Unique constraint violation on: event_id',
      }),
    );
  });

  it('should format P2002 without target metadata fallback to "fields"', () => {
    const filter = new PrismaClientExceptionFilter();
    const jsonFn = jest.fn();
    const statusFn = jest.fn().mockReturnValue({ json: jsonFn });

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusFn }),
      }),
    } as any;

    const exception = new Prisma.PrismaClientKnownRequestError('Unique error', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });

    filter.catch(exception, host);

    expect(statusFn).toHaveBeenCalledWith(409);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Unique constraint violation on: fields',
      }),
    );
  });

  it('should format P2025 record not found with cause metadata into 404 status', () => {
    const filter = new PrismaClientExceptionFilter();
    const jsonFn = jest.fn();
    const statusFn = jest.fn().mockReturnValue({ json: jsonFn });

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusFn }),
      }),
    } as any;

    const exception = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: '5.22.0',
      meta: { cause: 'Custom lead not found' },
    });

    filter.catch(exception, host);

    expect(statusFn).toHaveBeenCalledWith(404);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Custom lead not found',
      }),
    );
  });

  it('should format P2025 record not found without cause fallback to "Record not found"', () => {
    const filter = new PrismaClientExceptionFilter();
    const jsonFn = jest.fn();
    const statusFn = jest.fn().mockReturnValue({ json: jsonFn });

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusFn }),
      }),
    } as any;

    const exception = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: '5.22.0',
    });

    filter.catch(exception, host);

    expect(statusFn).toHaveBeenCalledWith(404);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Record not found',
      }),
    );
  });

  it('should handle unhandled Prisma error code with 500 status', () => {
    const filter = new PrismaClientExceptionFilter();
    const jsonFn = jest.fn();
    const statusFn = jest.fn().mockReturnValue({ json: jsonFn });

    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusFn }),
      }),
    } as any;

    const exception = new Prisma.PrismaClientKnownRequestError('Unknown error', {
      code: 'P9999',
      clientVersion: '5.22.0',
    });

    filter.catch(exception, host);

    expect(statusFn).toHaveBeenCalledWith(500);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Database error code: P9999',
      }),
    );
  });
});

