import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { AppLogger } from '../../../common/logger/app-logger.service';
import { RetryService } from './retry.service';
import { BitrixRateLimiterService } from './bitrix-rate-limiter.service';
import { BITRIX_API_METHODS, BITRIX_CONSTANTS } from '../constants/bitrix-api.constants';

export interface BitrixBatchResponse {
  result: Record<string, any>;
  result_error: Record<string, any>;
}

@Injectable()
export class BitrixHttpService {
  private readonly httpClient: AxiosInstance;
  private readonly baseUrl: string;
  private readonly maxRetries: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly retryService: RetryService,
    private readonly rateLimiter: BitrixRateLimiterService,
    private readonly logger: AppLogger,
  ) {
    const rawUrl = this.configService?.get<string>('bitrix.webhookUrl') || '';
    this.baseUrl = rawUrl.replace(/\/+$/, '');
    this.maxRetries = this.configService?.get<number>('bitrix.maxRetries') || 3;

    this.httpClient = axios.create({
      timeout: BITRIX_CONSTANTS.DEFAULT_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  getEndpoint(method: string): string {
    const cleanMethod = method.replace(/^\/+/, '');
    return `${this.baseUrl}/${cleanMethod}.json`;
  }

  async callMethod<T = any>(method: string, params: Record<string, any> = {}): Promise<T> {
    const url = this.getEndpoint(method);

    return this.rateLimiter.acquire(async () => {
      return await this.retryService.executeWithRetry(
        async () => {
          this.logger.debug(`Calling Bitrix24 method: ${method}`, 'BitrixHttpService');
          const response = await this.httpClient.post(url, params);

          if (response.data && response.data.error) {
            const desc = response.data.error_description || response.data.error;
            const err: any = new Error(`Bitrix24 Error [${response.data.error}]: ${desc}`);
            err.bitrixError = response.data.error;
            err.response = response;
            throw err;
          }

          return response.data?.result;
        },
        {
          maxRetries: this.maxRetries,
          operationName: `Bitrix:${method}`,
        },
      );
    });
  }

  async executeBatch(commands: Record<string, string>, haltOnError = false): Promise<BitrixBatchResponse> {
    const commandEntries = Object.entries(commands);
    if (commandEntries.length === 0) {
      return { result: {}, result_error: {} };
    }

    const aggregatedResult: Record<string, any> = {};
    const aggregatedError: Record<string, any> = {};
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
