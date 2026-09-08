import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../common/logger/app-logger.service.js';

// Configuration options for retry execution
export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  operationName?: string;
}

// Executes asynchronous operations with exponential backoff and randomized jitter
@Injectable()
export class RetryService {
  constructor(private readonly logger: AppLogger) {}

  // Retries failed operations up to maxRetries if error is transient
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {},
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? 3;
    const baseDelayMs = options.baseDelayMs ?? 1000;
    const maxDelayMs = options.maxDelayMs ?? 10000;
    const operationName = options.operationName ?? 'RemoteOperation';

    let attempt = 0;
    while (true) {
      try {
        return await operation();
      } catch (error: any) {
        attempt++;
        if (attempt > maxRetries || !this.isRetryable(error)) {
          throw error;
        }

        // Calculate exponential backoff interval with 25% randomized jitter
        const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        const jitter = Math.random() * 0.5 + 0.75;
        const sleepMs = Math.floor(exponentialDelay * jitter);

        this.logger.warn(
          `[${operationName}] Attempt ${attempt}/${maxRetries} failed: ${error.message}. Retrying in ${sleepMs}ms...`,
          'RetryService',
        );

        await new Promise((resolve) => setTimeout(resolve, sleepMs));
      }
    }
  }

  // Determines whether an error is transient (HTTP 429/5xx, network disconnect, or rate quota)
  isRetryable(error: any): boolean {
    if (!error) return false;

    // Checks network-level disconnections or timeouts
    const networkErrors = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
    if (error.code && networkErrors.includes(error.code)) {
      return true;
    }

    // Checks HTTP status codes for rate limit or server error (Axios & Google API client)
    const status = error.response?.status ?? error.status ?? (typeof error.code === 'number' ? error.code : undefined);
    if (status === 429 || (typeof status === 'number' && status >= 500 && status <= 504)) {
      return true;
    }

    // Checks Bitrix query limit error code
    if (error.response?.data?.error === 'QUERY_LIMIT_EXCEEDED') {
      return true;
    }

    // Checks Google API quota / rate limit errors
    if (
      error.errors &&
      Array.isArray(error.errors) &&
      error.errors.some((e: any) => e.reason === 'rateLimitExceeded' || e.reason === 'userRateLimitExceeded')
    ) {
      return true;
    }

    return false;
  }
}
