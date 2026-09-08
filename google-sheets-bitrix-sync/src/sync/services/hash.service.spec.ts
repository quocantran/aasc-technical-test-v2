// Unit tests for HashService verifying canonical SHA-256 hashing

import { describe, it, expect } from 'vitest';
import { HashService } from './hash.service.js';

describe('HashService', () => {
  const hashService = new HashService();

  it('should generate identical hashes regardless of object key insertion order', () => {
    const obj1 = { title: 'Lead 1', email: 'test@example.com', opportunity: 5000 };
    const obj2 = { opportunity: 5000, title: 'Lead 1', email: 'test@example.com' };

    const hash1 = hashService.computeHash(obj1);
    const hash2 = hashService.computeHash(obj2);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // Valid SHA-256 hex string
  });

  it('should handle null, undefined, nested arrays and objects', () => {
    const obj1 = {
      title: 'Lead 1',
      tags: ['tagA', 'tagB'],
      nullField: null,
      undefField: undefined,
      nested: { a: 1, b: 2 },
    };
    const obj2 = {
      tags: ['tagA', 'tagB'],
      title: 'Lead 1',
      nested: { b: 2, a: 1 },
      undefField: undefined,
      nullField: null,
    };

    const hash1 = hashService.computeHash(obj1);
    const hash2 = hashService.computeHash(obj2);

    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different data values', () => {
    const obj1 = { title: 'Lead 1' };
    const obj2 = { title: 'Lead 2' };

    expect(hashService.computeHash(obj1)).not.toBe(hashService.computeHash(obj2));
  });
});
