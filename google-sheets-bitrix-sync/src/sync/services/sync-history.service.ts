import { Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import fs from 'fs';
import { ISyncHistoryService, SyncExecutionResult } from '../interfaces/sync.interface.js';
import { SyncHistoryEntity } from '../entities/sync-history.entity.js';
import { SYNC_DIRECTIONS } from '../../common/constants/sync.constants.js';

// High-performance execution history service backed by indexed SQLite and in-memory LRU cache
@Injectable()
export class SyncHistoryService implements ISyncHistoryService, OnModuleInit {
  private readonly logger = new Logger(SyncHistoryService.name);
  private readonly syncHistory: SyncExecutionResult[] = [];
  private readonly legacyJsonPath = './config/sync-history.json';
  private readonly maxMemoryLogs = 100;

  constructor(
    @Optional()
    @InjectRepository(SyncHistoryEntity)
    private readonly historyRepo?: Repository<SyncHistoryEntity>,
  ) {}

  // Initializes database connection, seeds initial cache, and migrates legacy JSON records
  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    await this.initStorage();
  }

  // Restores recent history from SQLite and handles automatic one-time migration
  private async initStorage(): Promise<void> {
    if (!this.historyRepo) return;

    try {
      const count = await this.historyRepo.count();
      if (count > 0) {
        const records = await this.historyRepo.find({
          order: { createdAt: 'DESC' },
          take: this.maxMemoryLogs,
        });
        this.syncHistory.push(...records.map((r) => this.mapEntityToResult(r)));
        this.logger.log(`[SyncHistory] Loaded ${records.length} history records from SQLite database`);
        return;
      }

      // Automatically migrates legacy file-based history into SQLite on first initialization
      if (fs.existsSync(this.legacyJsonPath)) {
        const raw = fs.readFileSync(this.legacyJsonPath, 'utf-8');
        const parsed = JSON.parse(raw);
        const legacyRecords: any[] = Array.isArray(parsed) ? parsed : [parsed];

        for (const item of legacyRecords) {
          if (item && item.totalRows !== undefined) {
            await this.record(item);
          }
        }
        this.logger.log(`[SyncHistory] Migrated ${legacyRecords.length} legacy records to SQLite`);
      }
    } catch (err: any) {
      this.logger.warn(`[SyncHistory] Failed to initialize history from database: ${err.message}`);
    }
  }

  // Records execution result into high-speed memory cache and persists to SQLite
  async record(result: SyncExecutionResult): Promise<void> {
    this.syncHistory.unshift(result);
    if (this.syncHistory.length > this.maxMemoryLogs) {
      this.syncHistory.pop();
    }

    if (!this.historyRepo) return;

    const entity = this.historyRepo.create({
      direction: result.direction || SYNC_DIRECTIONS.SHEETS_TO_BITRIX,
      totalRows: result.totalRows || 0,
      created: result.created || 0,
      updated: result.updated || 0,
      skipped: result.skipped || 0,
      failed: result.failed || 0,
      deleted: result.deleted || 0,
      durationMs: result.durationMs || 0,
      timestamp: result.timestamp || new Date().toISOString(),
      syncedLeadIds: result.syncedLeadIds ? JSON.stringify(result.syncedLeadIds) : undefined,
    });

    try {
      await this.historyRepo.save(entity);
    } catch (err: any) {
      this.logger.error(`[SyncHistory] Failed to persist sync log to SQLite: ${err.message}`);
    }
  }

  // Returns recent execution logs from fast in-memory cache (defaults to 20)
  getRecentLogs(limit = 20, offset = 0): SyncExecutionResult[] {
    return this.syncHistory.slice(offset, offset + limit);
  }

  // Queries historical execution records directly from SQLite with pagination
  async queryHistory(limit = 50, offset = 0): Promise<SyncExecutionResult[]> {
    if (!this.historyRepo) {
      return this.getRecentLogs(limit, offset);
    }
    const entities = await this.historyRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return entities.map((e) => this.mapEntityToResult(e));
  }

  // Returns the most recent sync execution result
  getLastResult(): SyncExecutionResult | null {
    return this.syncHistory[0] || null;
  }

  // Maps a TypeORM database entity to the canonical SyncExecutionResult interface
  private mapEntityToResult(e: SyncHistoryEntity): SyncExecutionResult {
    let syncedLeadIds: (string | number)[] | undefined;
    if (e.syncedLeadIds) {
      try {
        syncedLeadIds = JSON.parse(e.syncedLeadIds);
      } catch {
        syncedLeadIds = undefined;
      }
    }
    return {
      direction: e.direction,
      totalRows: e.totalRows,
      created: e.created,
      updated: e.updated,
      skipped: e.skipped,
      failed: e.failed,
      deleted: e.deleted,
      durationMs: e.durationMs,
      timestamp: e.timestamp,
      syncedLeadIds,
    };
  }
}
