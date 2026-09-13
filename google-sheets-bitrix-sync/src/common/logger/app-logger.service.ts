import { Injectable, LoggerService } from '@nestjs/common';
import pino from 'pino';

// Data transfer interface for execution summary reporting
export interface SyncSummaryData {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  durationMs: number;
  direction?: string;
  deleted?: number;
}

// Application logger wrapping Pino for structured and pretty-printed logs
@Injectable()
export class AppLogger implements LoggerService {
  private readonly pinoLogger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV !== 'production'
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

  // Logs informational messages with optional context
  log(message: string, context?: string): void {
    this.pinoLogger.info({ context }, message);
  }

  // Logs error events including stack traces
  error(message: string, trace?: string, context?: string): void {
    this.pinoLogger.error({ context, trace }, message);
  }

  // Logs warning conditions requiring operator attention
  warn(message: string, context?: string): void {
    this.pinoLogger.warn({ context }, message);
  }

  // Logs detailed debugging data for development troubleshooting
  debug(message: string, context?: string): void {
    this.pinoLogger.debug({ context }, message);
  }

  // Logs granular trace messages
  verbose(message: string, context?: string): void {
    this.pinoLogger.trace({ context }, message);
  }

  // Prints the execution summary table in Vietnamese to stdout
  printVietnameseSummary(summary: SyncSummaryData): void {
    const durationSec = (summary.durationMs / 1000).toFixed(2);
    const isReverse = summary.direction === 'BITRIX_TO_SHEETS';
    const title = isReverse
      ? 'KẾT QUẢ ĐỒNG BỘ BITRIX24 -> GOOGLE SHEETS'
      : 'KẾT QUẢ ĐỒNG BỘ GOOGLE SHEETS -> BITRIX24';
    const firstLine = isReverse
      ? `Tổng số bản ghi trên CRM    : ${summary.totalRows}`
      : `Tổng số bản ghi đọc được    : ${summary.totalRows}`;
    const deletedLine = summary.deleted ? `Bản ghi xóa trên Sheet      : ${summary.deleted}\n` : '';
    const output = `
==================================================
      ${title}
==================================================
${firstLine}
Bản ghi tạo mới thành công  : ${summary.created}
Bản ghi cập nhật thành công : ${summary.updated}
${deletedLine}Bản ghi bỏ qua (không đổi)  : ${summary.skipped}
Bản ghi gặp lỗi             : ${summary.failed}
Tổng thời gian thực hiện    : ${durationSec}s
==================================================
`;
    // eslint-disable-next-line no-console
    console.log(output);
  }
}
