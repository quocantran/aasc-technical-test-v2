// Unit tests for MappingService testing row transformation, field rules, and error detection

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import { MappingService } from './mapping.service.js';
import { MappingConfiguration } from '../interfaces/mapping-config.interface.js';
import { ERROR_MESSAGES_VI } from '../../common/constants/error-messages.constants.js';

describe('MappingService', () => {
  let mappingService: MappingService;
  let mockConfigService: any;
  let mockLogger: any;

  const sampleConfig: MappingConfiguration = {
    fields: [
      { sheetColumn: 'Họ và tên', bitrixField: 'NAME', type: 'string' },
      { sheetColumn: 'Tiêu đề Lead', bitrixField: 'TITLE', type: 'string', required: true },
      {
        sheetColumn: 'Email',
        bitrixField: 'EMAIL',
        type: 'multifield',
        valueType: 'WORK',
      },
      {
        sheetColumn: 'Số điện thoại',
        bitrixField: 'PHONE',
        type: 'multifield',
        valueType: 'WORK',
      },
      {
        sheetColumn: 'Nguồn',
        bitrixField: 'SOURCE_ID',
        type: 'enum',
        valueMapping: { Website: 'WEB', Facebook: 'FACEBOOK' },
        defaultValue: 'OTHER',
      },
      { sheetColumn: 'Ngân sách', bitrixField: 'OPPORTUNITY', type: 'number' },
      { sheetColumn: 'Mã số thuế', bitrixField: 'UF_CRM_TAX_ID', type: 'custom' },
    ],
  };

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn().mockReturnValue('./config/mapping.json'),
    };
    mockLogger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    mappingService = new MappingService(mockConfigService, mockLogger);
    mappingService.loadMappingConfig(sampleConfig);
  });

  it('should transform a valid row into correct Bitrix fields format', () => {
    const row = {
      'Họ và tên': 'Nguyễn Văn A',
      'Tiêu đề Lead': 'Tư vấn phần mềm',
      Email: 'An.Nguyen@Domain.COM',
      'Số điện thoại': '0901234567',
      Nguồn: 'Website',
      'Ngân sách': '50,000,000',
      'Mã số thuế': '0101234567',
    };

    const result = mappingService.transformRow(row);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.bitrixFields.NAME).toBe('Nguyễn Văn A');
    expect(result.bitrixFields.TITLE).toBe('Tư vấn phần mềm');
    expect(result.bitrixFields.EMAIL).toEqual([{ VALUE: 'an.nguyen@domain.com', VALUE_TYPE: 'WORK' }]);
    expect(result.bitrixFields.PHONE).toEqual([{ VALUE: '+84901234567', VALUE_TYPE: 'WORK' }]);
    expect(result.bitrixFields.SOURCE_ID).toBe('WEB');
    expect(result.bitrixFields.OPPORTUNITY).toBe(50000000);
    expect(result.bitrixFields.UF_CRM_TAX_ID).toBe('0101234567');
  });

  it('should return error for invalid enum value instead of silently falling back', () => {
    const row = {
      'Tiêu đề Lead': 'Lead Demo',
      'Số điện thoại': '0912345678',
      Nguồn: 'Kênh TikTok',
    };

    const result = mappingService.transformRow(row);
    expect(result.errors.some((e) => e.includes("Giá trị 'Kênh TikTok' không hợp lệ cho cột 'Nguồn'"))).toBe(true);
    expect(result.errors.some((e) => e.includes('Vui lòng xem lại các giá trị hợp lệ trên Bitrix24'))).toBe(true);
  });

  it('should apply defaultValue when enum field is empty', () => {
    const row = {
      'Tiêu đề Lead': 'Lead Demo',
      'Số điện thoại': '0912345678',
      Nguồn: '',
    };

    const result = mappingService.transformRow(row);
    expect(result.success).toBe(true);
    expect(result.bitrixFields.SOURCE_ID).toBe('OTHER');
  });

  it('should ignore columns that are not in mapping configuration', () => {
    mappingService.loadMappingConfig({
      fields: [
        { sheetColumn: 'Tên khách hàng', bitrixField: 'NAME', type: 'string' },
        { sheetColumn: 'Email', bitrixField: 'EMAIL', type: 'multifield' },
        { sheetColumn: 'Số điện thoại', bitrixField: 'PHONE', type: 'multifield' },
      ],
    });

    const row = {
      'Tên khách hàng': 'Nguyễn Văn An',
      Email: 'an.nguyen@achau.vn',
      'Số điện thoại': '0901234567',
      'Tiêu đề lead': '155',
      'Công ty': 'Công ty Bị Xóa Mapping',
      'Mã số thuế': '999999999',
    };

    const result = mappingService.transformRow(row);
    expect(result.success).toBe(true);
    expect(result.canonicalData.COMPANY_TITLE).toBeUndefined();
    expect(result.canonicalData.TITLE).toBeUndefined();
    expect(result.canonicalData.UF_CRM_TAX).toBeUndefined();
    expect(result.bitrixFields.COMPANY_TITLE).toBeUndefined();
  });

  it('should map enum value case-insensitively and support direct CRM code', () => {
    const rowLower = {
      'Tiêu đề Lead': 'Lead Case Test',
      'Số điện thoại': '0912345678',
      Nguồn: 'facebook',
    };
    const resLower = mappingService.transformRow(rowLower);
    expect(resLower.success).toBe(true);
    expect(resLower.bitrixFields.SOURCE_ID).toBe('FACEBOOK');

    const rowCode = {
      'Tiêu đề Lead': 'Lead Direct Code',
      'Số điện thoại': '0912345678',
      Nguồn: 'FACEBOOK',
    };
    const resCode = mappingService.transformRow(rowCode);
    expect(resCode.success).toBe(true);
    expect(resCode.bitrixFields.SOURCE_ID).toBe('FACEBOOK');
  });

  it('should return error when required TITLE is missing', () => {
    const row = {
      'Họ và tên': 'Nguyễn Văn A',
      Email: 'test@example.com',
    };

    const result = mappingService.transformRow(row);
    expect(result.success).toBe(false);
    expect(result.errors.some((err) => err.includes(ERROR_MESSAGES_VI.MISSING_TITLE_OR_NAME))).toBe(true);
  });

  it('should return error when both Email and Phone are missing', () => {
    const row = {
      'Tiêu đề Lead': 'Lead không liên hệ',
    };

    const result = mappingService.transformRow(row);
    expect(result.success).toBe(false);
    expect(result.errors).toContain(ERROR_MESSAGES_VI.MISSING_CONTACT_INFO);
  });

  it('should format DD/MM/YYYY date to YYYY-MM-DD for date fields', () => {
    mappingService.loadMappingConfig({
      fields: [
        { sheetColumn: 'Tiêu đề Lead', bitrixField: 'TITLE', type: 'string' },
        { sheetColumn: 'Email', bitrixField: 'EMAIL', type: 'multifield' },
        { sheetColumn: 'Ngày sinh', bitrixField: 'BIRTHDATE', type: 'date' },
      ],
    });

    const row = {
      'Tiêu đề Lead': 'Lead 1',
      Email: 'test@example.com',
      'Ngày sinh': '25/12/1995',
    };

    const result = mappingService.transformRow(row);
    expect(result.success).toBe(true);
    expect(result.bitrixFields.BIRTHDATE).toBe('1995-12-25');
  });

  it('should return error for invalid non-numeric string in number field', () => {
    const row = {
      'Tiêu đề Lead': 'Lead Num Test',
      'Số điện thoại': '0912345678',
      'Ngân sách': 'nam muoi trieu',
    };

    const result = mappingService.transformRow(row);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('Ngân sách') && e.includes('số hợp lệ'))).toBe(true);
  });

  it('should return error for partially numeric string like 131230abd in number field', () => {
    const row = {
      'Tiêu đề Lead': 'Lead Num Test',
      'Số điện thoại': '0912345678',
      'Ngân sách': '131230abd',
    };

    const result = mappingService.transformRow(row);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('Ngân sách') && e.includes('số hợp lệ'))).toBe(true);
  });

  it('should return error for out-of-range date in date field', () => {
    mappingService.loadMappingConfig({
      fields: [
        { sheetColumn: 'Tiêu đề Lead', bitrixField: 'TITLE', type: 'string' },
        { sheetColumn: 'Email', bitrixField: 'EMAIL', type: 'multifield' },
        { sheetColumn: 'Ngày sinh', bitrixField: 'BIRTHDATE', type: 'date' },
      ],
    });

    const row = {
      'Tiêu đề Lead': 'Lead Date Test',
      Email: 'test@example.com',
      'Ngày sinh': '35/15/1995',
    };

    const result = mappingService.transformRow(row);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('Ngày sinh') && e.includes('ngày hợp lệ'))).toBe(true);
  });

  it('should transform Bitrix lead back to sheet columns in transformBitrixToRow', () => {
    mappingService.loadMappingConfig(sampleConfig);
    const bitrixLead = {
      NAME: 'Nguyễn Văn A',
      TITLE: 'Tư vấn phần mềm',
      EMAIL: [{ VALUE: 'an.nguyen@domain.com' }],
      SOURCE_ID: 'WEB',
      OPPORTUNITY: '50000000.00',
    };

    const sheetRow = mappingService.transformBitrixToRow(bitrixLead);
    expect(sheetRow['Họ và tên']).toBe('Nguyễn Văn A');
    expect(sheetRow['Tiêu đề Lead']).toBe('Tư vấn phần mềm');
    expect(sheetRow['Email']).toBe('an.nguyen@domain.com');
    expect(sheetRow['Nguồn']).toBe('Website');
    expect(sheetRow['Ngân sách']).toBe('50000000');
  });

  it('should format 0.00 to 0 for number/opportunity fields in transformBitrixToRow', () => {
    mappingService.loadMappingConfig(sampleConfig);
    const bitrixLead = {
      TITLE: 'Lead Miễn phí',
      OPPORTUNITY: '0.00',
    };

    const sheetRow = mappingService.transformBitrixToRow(bitrixLead);
    expect(sheetRow['Ngân sách']).toBe('0');
  });

  it('should apply fallback for TITLE when Tiêu đề Lead is empty', () => {
    mappingService.loadMappingConfig({
      fields: [
        { sheetColumn: 'Tiêu đề Lead', bitrixField: 'TITLE', type: 'string', required: false },
        { sheetColumn: 'Tên khách hàng', bitrixField: 'NAME', type: 'string' },
        { sheetColumn: 'Công ty', bitrixField: 'COMPANY_TITLE', type: 'string' },
        { sheetColumn: 'Email', bitrixField: 'EMAIL', type: 'multifield' },
      ],
    });

    const row = {
      'Tiêu đề Lead': '',
      'Tên khách hàng': 'Lê Hoàng Nam',
      'Công ty': 'Tập đoàn Nam Long',
      Email: 'nam.le@namlong.com',
    };

    const result = mappingService.transformRow(row);
    expect(result.success).toBe(true);
    expect(result.bitrixFields.TITLE).toBe('Lê Hoàng Nam - nam.le@namlong.com');
    expect(result.bitrixFields.NAME).toBe('Lê Hoàng Nam');
    expect(result.bitrixFields.COMPANY_TITLE).toBe('Tập đoàn Nam Long');
  });

  it('should succeed and auto-generate TITLE when Tiêu đề Lead column is completely absent', () => {
    mappingService.loadMappingConfig({
      fields: [
        { sheetColumn: 'Tên khách hàng', bitrixField: 'NAME', type: 'string' },
        { sheetColumn: 'Công ty', bitrixField: 'COMPANY_TITLE', type: 'string' },
        { sheetColumn: 'Email', bitrixField: 'EMAIL', type: 'multifield' },
      ],
    });

    const row = {
      'Tên khách hàng': 'Nguyễn Văn An',
      'Công ty': 'Á Châu ERP',
      Email: 'an.nguyen@achau.vn',
    };

    const result = mappingService.transformRow(row);
    expect(result.success).toBe(true);
    expect(result.bitrixFields.TITLE).toBe('Nguyễn Văn An - an.nguyen@achau.vn');
    expect(result.bitrixFields.NAME).toBe('Nguyễn Văn An');
  });

  it('should handle invalid phone number and email in transformRow', () => {
    mappingService.loadMappingConfig({
      fields: [
        { sheetColumn: 'Tiêu đề', bitrixField: 'TITLE', type: 'string' },
        { sheetColumn: 'Email', bitrixField: 'EMAIL', type: 'multifield' },
        { sheetColumn: 'SĐT', bitrixField: 'PHONE', type: 'multifield' },
      ],
    });

    const row = {
      'Tiêu đề': 'Lead Test',
      Email: 'invalid-email',
      SĐT: 'invalid-phone-123',
    };

    const result = mappingService.transformRow(row);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should handle generic multifield other than PHONE and EMAIL', () => {
    mappingService.loadMappingConfig({
      fields: [
        { sheetColumn: 'Tiêu đề', bitrixField: 'TITLE', type: 'string' },
        { sheetColumn: 'Website', bitrixField: 'WEB', type: 'multifield', valueType: 'WORK' },
        { sheetColumn: 'Email', bitrixField: 'EMAIL', type: 'multifield' },
      ],
    });

    const row = {
      'Tiêu đề': 'Lead Test',
      Website: 'https://example.com',
      Email: 'test@example.com',
    };

    const result = mappingService.transformRow(row);
    expect(result.success).toBe(true);
    expect(result.bitrixFields.WEB).toEqual([{ VALUE: 'https://example.com', VALUE_TYPE: 'WORK' }]);
  });

  it('should load mapping config from file in loadMappingConfig and onModuleInit', () => {
    const freshService = new MappingService(mockConfigService, mockLogger);
    freshService.onModuleInit();
    const config = freshService.getMappingConfig();
    expect(config).toBeDefined();
    expect(config.fields.length).toBeGreaterThan(0);
  });

  it('should handle missing mapping file gracefully in loadMappingConfig', () => {
    mockConfigService.get.mockReturnValue('./config/non_existent_mapping.json');
    const freshService = new MappingService(mockConfigService, mockLogger);
    freshService.loadMappingConfig();
    expect(freshService.getMappingConfig().fields).toHaveLength(0);
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('should validate mapping schema and throw on invalid config', () => {
    expect(() => mappingService.loadMappingConfig({ fields: [] })).toThrow();
    expect(() =>
      mappingService.loadMappingConfig({
        fields: [{ sheetColumn: '', bitrixField: 'NAME', type: 'string' }],
      }),
    ).toThrow();
  });

  it('should save mapping configuration using saveMappingConfig', () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const validConfig: MappingConfiguration = {
      fields: [{ sheetColumn: 'Họ và tên', bitrixField: 'NAME', type: 'string' }],
    };
    mappingService.saveMappingConfig(validConfig);
    expect(writeSpy).toHaveBeenCalled();
    expect(mappingService.getMappingConfig()).toEqual(validConfig);
    writeSpy.mockRestore();
  });
});



