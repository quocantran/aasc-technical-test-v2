import { Injectable, LoggerService } from '@nestjs/common';
import pino from 'pino';

export interface SyncSummaryData {
  totalLeads: number;
  created: number;
  updated: number;
  convertedDeals: number;
  failed: number;
  durationMs: number;
}

@Injectable()
export class AppLogger implements LoggerService {
  private readonly pinoLogger = pino({
    level: process.env.LOG_LEVEL || 'debug',
    redact: {
      paths: [
        'phone',
        'email',
        'authorization',
        'application_token',
        'password',
        'token',
        'secret',
        '*.phone',
        '*.email',
        '*.authorization',
        '*.application_token',
        '*.password',
        '*.token',
        '*.secret',
        'req.headers.authorization',
        'req.headers["x-api-key"]',
        'headers.authorization',
        'headers["x-api-key"]',
      ],
      censor: '[REDACTED]',
    },
    transport:
      process.env.NODE_ENV !== 'production' &&
      process.env.NODE_ENV !== 'test' &&
      process.env.PRETTY_LOGS !== 'false'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  });


  log(message: string, context?: string): void {
    this.pinoLogger.info({ context }, message);
  }

  error(message: string, trace?: string, context?: string): void {
    this.pinoLogger.error({ context, trace }, message);
  }

  warn(message: string, context?: string): void {
    this.pinoLogger.warn({ context }, message);
  }

  debug(message: string, context?: string): void {
    this.pinoLogger.debug({ context }, message);
  }

  verbose(message: string, context?: string): void {
    this.pinoLogger.trace({ context }, message);
  }

  printVietnameseSummary(summary: SyncSummaryData): void {
    const durationSec = (summary.durationMs / 1000).toFixed(2);
    const output = `
==================================================
   TIKTOK LEADS -> BITRIX24 CRM SYNC SUMMARY
==================================================
Total Leads Received         : ${summary.totalLeads}
New Leads in Bitrix24        : ${summary.created}
Updated Leads (Merged)       : ${summary.updated}
Auto-converted Deals         : ${summary.convertedDeals}
Failed Records               : ${summary.failed}
Total Processing Time        : ${durationSec}s
==================================================
`;
    console.log(output);
  }
}
