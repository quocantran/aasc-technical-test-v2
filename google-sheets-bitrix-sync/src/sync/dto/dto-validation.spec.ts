import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { TriggerSyncDto, TriggerSyncQueryDto } from './trigger-sync.dto.js';
import { ReverseSyncDto, ReverseSyncQueryDto } from './reverse-sync.dto.js';
import { BitrixWebhookDto } from './bitrix-webhook.dto.js';
import { FieldMappingDto } from '../../mapping/dto/field-mapping.dto.js';
import { UpdateMappingDto } from '../../mapping/dto/update-mapping.dto.js';
import { GetSyncLogsQueryDto } from '../../admin/dto/get-sync-logs.dto.js';
import { GoogleCallbackQueryDto } from '../../admin/dto/google-callback.dto.js';
import { TwoWaySyncDto } from '../../admin/dto/two-way-sync.dto.js';

describe('HTTP DTO Validation Tests', () => {
  describe('TriggerSyncDto & TriggerSyncQueryDto', () => {
    it('should validate valid TriggerSyncDto with boolean force', async () => {
      const dto = plainToInstance(TriggerSyncDto, { force: true });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.force).toBe(true);
    });

    it('should transform string "true" and "false" to boolean', async () => {
      const dtoTrue = plainToInstance(TriggerSyncDto, { force: 'true' });
      expect(await validate(dtoTrue)).toHaveLength(0);
      expect(dtoTrue.force).toBe(true);

      const dtoFalse = plainToInstance(TriggerSyncDto, { force: 'false' });
      expect(await validate(dtoFalse)).toHaveLength(0);
      expect(dtoFalse.force).toBe(false);
    });

    it('should allow empty TriggerSyncDto (force is optional)', async () => {
      const dto = plainToInstance(TriggerSyncDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid force value that cannot be boolean', async () => {
      const dto = plainToInstance(TriggerSyncDto, { force: 'invalid_string' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should validate TriggerSyncQueryDto with all boolean and string values', async () => {
      const qTrue = plainToInstance(TriggerSyncQueryDto, { force: 'true' });
      expect(await validate(qTrue)).toHaveLength(0);
      expect(qTrue.force).toBe(true);

      const qFalse = plainToInstance(TriggerSyncQueryDto, { force: 'false' });
      expect(await validate(qFalse)).toHaveLength(0);
      expect(qFalse.force).toBe(false);

      const qOne = plainToInstance(TriggerSyncQueryDto, { force: 1 });
      expect(await validate(qOne)).toHaveLength(0);
      expect(qOne.force).toBe(true);

      const qZero = plainToInstance(TriggerSyncQueryDto, { force: 0 });
      expect(await validate(qZero)).toHaveLength(0);
      expect(qZero.force).toBe(false);

      const qInvalid = plainToInstance(TriggerSyncQueryDto, { force: 'invalid' });
      const errors = await validate(qInvalid);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('ReverseSyncDto & ReverseSyncQueryDto', () => {
    it('should validate valid positive integer leadId', async () => {
      const dto = plainToInstance(ReverseSyncDto, { leadId: 42 });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.leadId).toBe(42);
    });

    it('should transform numeric string to number', async () => {
      const dto = plainToInstance(ReverseSyncDto, { leadId: '123' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.leadId).toBe(123);
    });

    it('should allow optional leadId (undefined)', async () => {
      const dto = plainToInstance(ReverseSyncDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject non-positive leadId (0 or negative)', async () => {
      const dtoZero = plainToInstance(ReverseSyncDto, { leadId: 0 });
      const errorsZero = await validate(dtoZero);
      expect(errorsZero.length).toBeGreaterThan(0);

      const dtoNeg = plainToInstance(ReverseSyncDto, { leadId: -10 });
      const errorsNeg = await validate(dtoNeg);
      expect(errorsNeg.length).toBeGreaterThan(0);
    });

    it('should reject non-numeric string for leadId', async () => {
      const dto = plainToInstance(ReverseSyncDto, { leadId: 'not_a_number' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should validate ReverseSyncQueryDto with valid leadId', async () => {
      const queryDto = plainToInstance(ReverseSyncQueryDto, { leadId: '99' });
      expect(await validate(queryDto)).toHaveLength(0);
      expect(queryDto.leadId).toBe(99);
    });
  });

  describe('BitrixWebhookDto', () => {
    it('should validate standard Bitrix24 webhook payload', async () => {
      const payload = {
        event: 'ONCRMLEADADD',
        data: { FIELDS: { ID: 999 } },
        auth: { application_token: 'secret123', domain: 'test.bitrix24.vn' },
      };
      const dto = plainToInstance(BitrixWebhookDto, payload);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject webhook payload missing event name', async () => {
      const payload = {
        data: { FIELDS: { ID: 999 } },
      };
      const dto = plainToInstance(BitrixWebhookDto, payload);
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('event');
    });

    it('should reject non-string event name', async () => {
      const dto = plainToInstance(BitrixWebhookDto, { event: 12345 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should allow webhook payload with flat ID and auth_token', async () => {
      const payload = {
        event: 'ONCRMLEADUPDATE',
        ID: '500',
        auth_token: 'fallback_token',
      };
      const dto = plainToInstance(BitrixWebhookDto, payload);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  describe('FieldMappingDto & UpdateMappingDto', () => {
    it('should validate valid FieldMappingDto', async () => {
      const validField = {
        sheetColumn: 'Họ và tên',
        bitrixField: 'NAME',
        type: 'string',
        required: true,
      };
      const dto = plainToInstance(FieldMappingDto, validField);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should validate enum field with valueMapping', async () => {
      const enumField = {
        sheetColumn: 'Nguồn',
        bitrixField: 'SOURCE_ID',
        type: 'enum',
        valueMapping: { Website: 'WEB', Facebook: 'FACEBOOK' },
        defaultValue: 'OTHER',
      };
      const dto = plainToInstance(FieldMappingDto, enumField);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject FieldMappingDto with invalid type', async () => {
      const invalidField = {
        sheetColumn: 'Tuổi',
        bitrixField: 'AGE',
        type: 'invalid_data_type',
      };
      const dto = plainToInstance(FieldMappingDto, invalidField);
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'type')).toBe(true);
    });

    it('should reject FieldMappingDto missing sheetColumn or bitrixField', async () => {
      const missingCol = plainToInstance(FieldMappingDto, { bitrixField: 'NAME', type: 'string' });
      expect(await validate(missingCol)).toHaveLength(1);

      const missingBField = plainToInstance(FieldMappingDto, { sheetColumn: 'Tên', type: 'string' });
      expect(await validate(missingBField)).toHaveLength(1);
    });

    it('should validate complete UpdateMappingDto with nested fields', async () => {
      const updateData = {
        fields: [
          { sheetColumn: 'Họ tên', bitrixField: 'NAME', type: 'string' },
          { sheetColumn: 'Email', bitrixField: 'EMAIL', type: 'multifield', valueType: 'WORK' },
        ],
      };
      const dto = plainToInstance(UpdateMappingDto, updateData);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject UpdateMappingDto with empty fields array', async () => {
      const dto = plainToInstance(UpdateMappingDto, { fields: [] });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('fields');
    });

    it('should reject UpdateMappingDto when a nested field is invalid', async () => {
      const updateData = {
        fields: [
          { sheetColumn: 'Họ tên', bitrixField: 'NAME', type: 'string' },
          { sheetColumn: '', bitrixField: 'PHONE', type: 'multifield' }, // empty sheetColumn
        ],
      };
      const dto = plainToInstance(UpdateMappingDto, updateData);
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('GetSyncLogsQueryDto', () => {
    it('should validate valid limit', async () => {
      const dto = plainToInstance(GetSyncLogsQueryDto, { limit: 50 });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.limit).toBe(50);
    });

    it('should transform numeric string limit', async () => {
      const dto = plainToInstance(GetSyncLogsQueryDto, { limit: '25' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.limit).toBe(25);
    });

    it('should reject limit out of bounds (< 1 or > 100)', async () => {
      const dtoLow = plainToInstance(GetSyncLogsQueryDto, { limit: 0 });
      expect(await validate(dtoLow)).toHaveLength(1);

      const dtoHigh = plainToInstance(GetSyncLogsQueryDto, { limit: 150 });
      expect(await validate(dtoHigh)).toHaveLength(1);
    });
  });

  describe('GoogleCallbackQueryDto', () => {
    it('should validate valid authorization code', async () => {
      const dto = plainToInstance(GoogleCallbackQueryDto, { code: '4/0AVMBX...' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject empty authorization code', async () => {
      const dto = plainToInstance(GoogleCallbackQueryDto, { code: '' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('TwoWaySyncDto', () => {
    it('should validate optional force boolean in TwoWaySyncDto', async () => {
      const dto = plainToInstance(TwoWaySyncDto, { force: true });
      expect(await validate(dto)).toHaveLength(0);

      const dtoEmpty = plainToInstance(TwoWaySyncDto, {});
      expect(await validate(dtoEmpty)).toHaveLength(0);
    });

    it('should reject invalid force in TwoWaySyncDto', async () => {
      const dto = plainToInstance(TwoWaySyncDto, { force: 'invalid' });
      expect(await validate(dto)).toHaveLength(1);
    });
  });
});
