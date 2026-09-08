import { Injectable } from '@nestjs/common';
import fs from 'fs';
import { ISyncHistoryService, SyncExecutionResult } from '../interfaces/sync.interface.js';

// Manages sync execution history cache and filesystem persistence (SRP)
@Injectable()
export class SyncHistoryService implements ISyncHistoryService {
  private readonly syncHistory: SyncExecutionResult[] = [];
  private readonly historyFilePath = './config/sync-history.json';

  constructor() {
    if (process.env.NODE_ENV !== 'test') {
      this.loadHistory();
    }
  }

  // Restores execution history from disk so dashboard displays stats after server restart
  loadHistory(): void {
    try {
      if (fs.existsSync(this.historyFilePath)) {
        const raw = fs.readFileSync(this.historyFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.syncHistory.push(parsed[0]);
        } else if (parsed && typeof parsed === 'object' && parsed.totalRows !== undefined) {
          this.syncHistory.push(parsed);
        }
      }
    } catch {
      // Ignored if file does not exist or cannot be parsed
    }
  }

  // Persists the single latest execution record to disk
  saveHistory(): void {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const latest = this.syncHistory[0] ? [this.syncHistory[0]] : [];
      fs.writeFileSync(this.historyFilePath, JSON.stringify(latest, null, 2), 'utf-8');
    } catch {
      // Ignored if writing fails
    }
  }

  // Records an execution result into history cache and persists to disk
  record(result: SyncExecutionResult): void {
    this.syncHistory.length = 0;
    this.syncHistory.push(result);
    this.saveHistory();
  }

  // Returns all stored execution logs
  getRecentLogs(): SyncExecutionResult[] {
    return [...this.syncHistory];
  }

  // Returns the most recent sync execution result
  getLastResult(): SyncExecutionResult | null {
    return this.syncHistory[0] || null;
  }
}
