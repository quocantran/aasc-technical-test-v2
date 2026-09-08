import { Injectable } from '@nestjs/common';
import crypto from 'crypto';

// Generates canonical SHA-256 hashes of row data for idempotent change detection
@Injectable()
export class HashService {
  // Computes deterministic hex SHA-256 hash by sorting object keys
  computeHash(data: Record<string, any>): string {
    const canonicalString = this.toCanonicalString(data);
    return crypto.createHash('sha256').update(canonicalString).digest('hex');
  }

  // Serializes arbitrary object into deterministic canonical representation
  private toCanonicalString(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.toCanonicalString(item)).join(',')}]`;
    }

    // Sorts object keys alphabetically to ensure consistent hashing
    if (typeof value === 'object') {
      const sortedKeys = Object.keys(value).sort();
      const entries = sortedKeys.map(
        (k) => `"${k}":${this.toCanonicalString(value[k])}`,
      );
      return `{${entries.join(',')}}`;
    }

    return JSON.stringify(value);
  }
}
