import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { AppLogger } from '../../common/logger/app-logger.service.js';
import { BITRIX_AUTH_STRATEGY } from '../interfaces/bitrix-auth.interface.js';
import type { IBitrixAuthStrategy } from '../interfaces/bitrix-auth.interface.js';
import { RetryService } from './retry.service.js';
import { BitrixRateLimiterService } from './bitrix-rate-limiter.service.js';
import { BITRIX_API_METHODS, BITRIX_CONSTANTS } from '../constants/bitrix-api.constants.js';

// Aggregate response payload from Bitrix24 batch REST method
export interface BitrixBatchResponse {
  result: Record<string, any>;
  result_error: Record<string, any>;
  result_total?: Record<string, number>;
}

// Low-level HTTP client executing rate-limited and retried calls to Bitrix24
@Injectable()
export class BitrixService {
  private readonly httpClient: AxiosInstance;
  private readonly maxRetries: number;

  constructor(
    private readonly configService: ConfigService,
    @Inject(BITRIX_AUTH_STRATEGY)
    private readonly authStrategy: IBitrixAuthStrategy,
    private readonly retryService: RetryService,
    private readonly rateLimiter: BitrixRateLimiterService,
    private readonly logger: AppLogger,
  ) {
    this.maxRetries = this.configService.get<number>('bitrix.maxRetries') || 3;
    this.httpClient = axios.create({
      timeout: BITRIX_CONSTANTS.DEFAULT_TIMEOUT_MS,
    });
  }

  // Executes a single Bitrix24 REST API method with rate limiting and exponential retry
  async callMethod<T = any>(method: string, params: Record<string, any> = {}): Promise<T> {
    const url = this.authStrategy.getEndpoint(method);
    const headers = await this.authStrategy.getHeaders();
    const body: Record<string, any> = { ...params };

    return this.rateLimiter.acquire(async () => {
      return await this.retryService.executeWithRetry(
        async () => {
          this.logger.debug(`Calling Bitrix24 method: ${method}`, 'BitrixService');
          const response = await this.httpClient.post(url, body, { headers });

          // Intercepts Bitrix error envelope and converts to Error instance
          if (response.data && response.data.error) {
            const description = response.data.error_description || response.data.error;
            const err: any = new Error(`Bitrix24 Error [${response.data.error}]: ${description}`);
            err.bitrixError = response.data.error;
            throw err;
          }

          return response.data.result;
        },
        {
          maxRetries: this.maxRetries,
          operationName: `Bitrix:${method}`,
        },
      );
    });
  }

  // Executes multiple REST commands in chunks of 50 via Bitrix batch method
  async executeBatch(
    commands: Record<string, string>,
    haltOnError = false,
  ): Promise<BitrixBatchResponse> {
    const commandEntries = Object.entries(commands);
    if (commandEntries.length === 0) {
      return { result: {}, result_error: {} };
    }

    const aggregatedResult: Record<string, any> = {};
    const aggregatedError: Record<string, any> = {};

    // Slices commands into chunks respecting the maximum 50 commands per batch
    const chunkSize = BITRIX_CONSTANTS.MAX_BATCH_COMMANDS;
    for (let i = 0; i < commandEntries.length; i += chunkSize) {
      const chunk = Object.fromEntries(commandEntries.slice(i, i + chunkSize));
      const response = await this.callMethod<BitrixBatchResponse>(BITRIX_API_METHODS.BATCH, {
        halt: haltOnError ? 1 : 0,
        cmd: chunk,
      });

      if (response?.result) {
        Object.assign(aggregatedResult, response.result);
      }
      if (response?.result_error) {
        Object.assign(aggregatedError, response.result_error);
      }
    }

    return {
      result: aggregatedResult,
      result_error: aggregatedError,
    };
  }
}
