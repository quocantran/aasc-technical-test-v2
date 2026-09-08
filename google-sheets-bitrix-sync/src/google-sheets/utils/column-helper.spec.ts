// Tests for column index to A1 alphabetical notation conversion
import { describe, it, expect } from 'vitest';
import { indexToA1Column, a1ColumnToIndex } from './column-helper.js';

describe('column-helper', () => {
  it('should convert indices to correct A1 notation letters', () => {
    expect(indexToA1Column(0)).toBe('A');
    expect(indexToA1Column(25)).toBe('Z');
    expect(indexToA1Column(26)).toBe('AA');
    expect(indexToA1Column(27)).toBe('AB');
    expect(indexToA1Column(51)).toBe('AZ');
    expect(indexToA1Column(52)).toBe('BA');
    expect(indexToA1Column(701)).toBe('ZZ');
  });

  it('should convert A1 letters back to zero-based index', () => {
    expect(a1ColumnToIndex('A')).toBe(0);
    expect(a1ColumnToIndex('Z')).toBe(25);
    expect(a1ColumnToIndex('AA')).toBe(26);
    expect(a1ColumnToIndex('AB')).toBe(27);
    expect(a1ColumnToIndex('ZZ')).toBe(701);
  });
});
