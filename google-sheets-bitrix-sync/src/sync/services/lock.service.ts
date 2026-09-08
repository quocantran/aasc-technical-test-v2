import { Injectable } from '@nestjs/common';
import { SYNC_DEFAULTS } from '../../common/constants/sync.constants.js';

// Holds expiration timestamp for an acquired concurrency lock
interface LockEntry {
  expiresAt: number;
}

// In-memory mutex lock preventing concurrent sync operations with auto-release TTL
@Injectable()
export class LockService {
  private locks = new Map<string, LockEntry>();

  // Attempts to acquire a lock key; returns false if already held by another job
  acquire(key: string = 'sync_job', ttlMs: number = SYNC_DEFAULTS.MUTEX_TIMEOUT_MS): boolean {
    const now = Date.now();
    const existing = this.locks.get(key);

    if (existing && existing.expiresAt > now) {
      return false;
    }

    this.locks.set(key, { expiresAt: now + ttlMs });
    return true;
  }

  // Explicitly releases the specified lock key
  release(key: string = 'sync_job'): void {
    this.locks.delete(key);
  }

  // Checks whether the specified lock key is currently held and unexpired
  isLocked(key: string = 'sync_job'): boolean {
    const now = Date.now();
    const existing = this.locks.get(key);
    if (!existing) return false;

    if (existing.expiresAt <= now) {
      this.locks.delete(key);
      return false;
    }

    return true;
  }
}
