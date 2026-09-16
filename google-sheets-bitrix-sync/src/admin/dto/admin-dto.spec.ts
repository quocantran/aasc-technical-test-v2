import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GoogleCallbackQueryDto } from './google-callback.dto.js';
import { TwoWaySyncDto } from './two-way-sync.dto.js';
import { GetSyncLogsQueryDto } from './get-sync-logs.dto.js';

describe('Admin DTOs Validation Tests', () => {
  describe('GoogleCallbackQueryDto', () => {
    it('should create instance via constructor and validate valid code', async () => {
      const dto = new GoogleCallbackQueryDto('4/0AVMBX_valid_code');
      expect(dto.code).toBe('4/0AVMBX_valid_code');
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should create empty instance via constructor without args', async () => {
      const dto = new GoogleCallbackQueryDto();
      expect(dto.code).toBeUndefined();
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should validate instance via plainToInstance', async () => {
      const dto = plainToInstance(GoogleCallbackQueryDto, { code: 'code123' });
      expect(dto.code).toBe('code123');
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject empty code', async () => {
      const dto = new GoogleCallbackQueryDto('');
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('code');
    });

    it('should reject non-string code', async () => {
      const dto = plainToInstance(GoogleCallbackQueryDto, { code: 12345 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('TwoWaySyncDto', () => {
    it('should create instance via constructor with force=true', async () => {
      const dto = new TwoWaySyncDto(true);
      expect(dto.force).toBe(true);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should create instance via constructor with force=false', async () => {
      const dto = new TwoWaySyncDto(false);
      expect(dto.force).toBe(false);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should create empty instance without args', async () => {
      const dto = new TwoWaySyncDto();
      expect(dto.force).toBeUndefined();
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject non-boolean force', async () => {
      const dto = plainToInstance(TwoWaySyncDto, { force: 'invalid' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('force');
    });
  });

  describe('GetSyncLogsQueryDto', () => {
    it('should validate default and valid limits', async () => {
      const dto = plainToInstance(GetSyncLogsQueryDto, { limit: 20 });
      expect(dto.limit).toBe(20);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should transform and validate string limit', async () => {
      const dto = plainToInstance(GetSyncLogsQueryDto, { limit: '50' });
      expect(dto.limit).toBe(50);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject limit < 1', async () => {
      const dto = plainToInstance(GetSyncLogsQueryDto, { limit: 0 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject limit > 100', async () => {
      const dto = plainToInstance(GetSyncLogsQueryDto, { limit: 101 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
