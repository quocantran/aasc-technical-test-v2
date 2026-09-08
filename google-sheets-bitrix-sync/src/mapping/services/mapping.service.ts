import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'fs';
import path from 'path';
import { AppLogger } from '../../common/logger/app-logger.service.js';
import { MappingConfiguration } from '../interfaces/mapping-config.interface.js';
import { normalizeVietnamesePhone } from '../normalizers/phone.normalizer.js';
import { normalizeEmail } from '../normalizers/email.normalizer.js';
import { ERROR_MESSAGES_VI } from '../../common/constants/error-messages.constants.js';

// Output payload of a transformed sheet row including validation status
export interface RowTransformationResult {
  success: boolean;
  bitrixFields: Record<string, any>;
  errors: string[];
  email?: string;
  phone?: string;
  title?: string;
  name?: string;
  canonicalData: Record<string, any>;
}

// Transforms raw Google Sheet rows into Bitrix24 lead fields and vice versa based on mapping.json
@Injectable()
export class MappingService implements OnModuleInit {
  private config: MappingConfiguration = { fields: [] };
  private isCustomConfig = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  // Initializes field mappings on module start
  onModuleInit(): void {
    this.loadMappingConfig();
  }

  // Reads and parses mapping rules from filesystem or accepts in-memory config for testing
  loadMappingConfig(customConfig?: MappingConfiguration): void {
    if (customConfig) {
      this.validateConfig(customConfig);
      this.config = customConfig;
      this.isCustomConfig = true;
      return;
    }

    if (this.isCustomConfig) {
      return;
    }

    const mappingPath = this.configService.get<string>('sync.mappingPath') || './config/mapping.json';
    const resolvedPath = path.resolve(process.cwd(), mappingPath);

    if (!fs.existsSync(resolvedPath)) {
      this.logger.warn(`Mapping file not found at ${resolvedPath}, using empty configuration`, 'MappingService');
      this.config = { fields: [] };
      return;
    }

    try {
      const fileContent = fs.readFileSync(resolvedPath, 'utf8');
      this.config = JSON.parse(fileContent);
      this.validateConfig(this.config);
      this.logger.log(`Loaded ${this.config.fields.length} field mappings from ${mappingPath}`, 'MappingService');
    } catch (error: any) {
      this.logger.error(`Failed to parse mapping configuration: ${error.message}`, error.stack, 'MappingService');
      throw error;
    }
  }

  // Persists updated mapping rules to file
  saveMappingConfig(newConfig: MappingConfiguration): void {
    this.validateConfig(newConfig);
    const mappingPath = this.configService.get<string>('sync.mappingPath') || './config/mapping.json';
    const resolvedPath = path.resolve(process.cwd(), mappingPath);

    fs.writeFileSync(resolvedPath, JSON.stringify(newConfig, null, 2), 'utf8');
    this.config = newConfig;
    this.logger.log(`Saved and reloaded ${newConfig.fields.length} field mappings to ${mappingPath}`, 'MappingService');
  }

  // Returns current active mapping configuration
  getMappingConfig(): MappingConfiguration {
    return this.config;
  }

  // Transforms a row map into Bitrix field values and canonical object for hashing
  transformRow(rowValues: Record<string, any>): RowTransformationResult {
    const bitrixFields: Record<string, any> = {};
    const canonicalData: Record<string, any> = {};
    const errors: string[] = [];

    let extractedEmail: string | undefined;
    let extractedPhone: string | undefined;
    let extractedTitle: string | undefined;
    let extractedName: string | undefined;

    const normalizedRowValues: Record<string, any> = {};
    for (const [k, v] of Object.entries(rowValues)) {
      normalizedRowValues[k.trim().toLowerCase()] = v;
    }

    for (const field of this.config.fields) {
      const rawValue =
        rowValues[field.sheetColumn] ??
        rowValues[field.sheetColumn.trim()] ??
        normalizedRowValues[field.sheetColumn.trim().toLowerCase()];
      const stringValue = rawValue !== undefined && rawValue !== null ? String(rawValue).trim() : '';

      // Validates presence of mandatory fields
      if (field.required && !stringValue) {
        errors.push(`${ERROR_MESSAGES_VI.MISSING_TITLE_OR_NAME} (${field.sheetColumn})`);
        continue;
      }


      // Applies default value if column is empty
      if (!stringValue) {
        if (field.defaultValue !== undefined) {
          bitrixFields[field.bitrixField] = field.defaultValue;
          canonicalData[field.bitrixField] = field.defaultValue;
        }
        continue;
      }

      // Normalizes and packages multifield communication entries (PHONE / EMAIL)
      if (field.type === 'multifield') {
        if (field.bitrixField === 'PHONE') {
          const phoneRes = normalizeVietnamesePhone(stringValue);
          if (!phoneRes.isValid) {
            errors.push(phoneRes.error || ERROR_MESSAGES_VI.INVALID_PHONE_FORMAT);
          } else {
            extractedPhone = phoneRes.normalized;
            canonicalData[field.bitrixField] = phoneRes.normalized;
            bitrixFields[field.bitrixField] = [
              {
                VALUE: phoneRes.normalized,
                VALUE_TYPE: field.valueType || 'WORK',
              },
            ];
          }
        } else if (field.bitrixField === 'EMAIL') {
          const emailRes = normalizeEmail(stringValue);
          if (!emailRes.isValid) {
            errors.push(emailRes.error || ERROR_MESSAGES_VI.INVALID_EMAIL_FORMAT);
          } else {
            extractedEmail = emailRes.normalized;
            canonicalData[field.bitrixField] = emailRes.normalized;
            bitrixFields[field.bitrixField] = [
              {
                VALUE: emailRes.normalized,
                VALUE_TYPE: field.valueType || 'WORK',
              },
            ];
          }
        } else {
          canonicalData[field.bitrixField] = stringValue;
          bitrixFields[field.bitrixField] = [
            {
              VALUE: stringValue,
              VALUE_TYPE: field.valueType || 'WORK',
            },
          ];
        }
        continue;
      }

      // Resolves enumeration value mappings
      if (field.type === 'enum') {
        const mappedValue = field.valueMapping?.[stringValue] || field.defaultValue || stringValue;
        bitrixFields[field.bitrixField] = mappedValue;
        canonicalData[field.bitrixField] = mappedValue;
        continue;
      }

      // Parses and cleans numeric values
      if (field.type === 'number') {
        const cleanedNumber = stringValue.replace(/,/g, '');
        const parsedNumber = parseFloat(cleanedNumber);
        const finalNum = isNaN(parsedNumber) ? 0 : parsedNumber;
        bitrixFields[field.bitrixField] = finalNum;
        canonicalData[field.bitrixField] = finalNum;
        continue;
      }

      // Parses and formats date values to YYYY-MM-DD
      if (field.type === 'date') {
        let formattedDate = stringValue;
        const dmyMatch = stringValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        if (dmyMatch) {
          const day = dmyMatch[1].padStart(2, '0');
          const month = dmyMatch[2].padStart(2, '0');
          const year = dmyMatch[3];
          formattedDate = `${year}-${month}-${day}`;
        }
        bitrixFields[field.bitrixField] = formattedDate;
        canonicalData[field.bitrixField] = formattedDate;
        continue;
      }

      // Assigns plain string or custom fields (e.g. UF_CRM_*)
      bitrixFields[field.bitrixField] = stringValue;
      canonicalData[field.bitrixField] = stringValue;

      if (field.bitrixField === 'TITLE') extractedTitle = stringValue;
      if (field.bitrixField === 'NAME') extractedName = stringValue;
    }

    // Fallback auto-detection for standard contact and identity fields if not explicitly mapped
    if (!extractedEmail) {
      const emailCandidate =
        normalizedRowValues['email'] ||
        normalizedRowValues['e-mail'] ||
        normalizedRowValues['thư điện tử'];
      if (emailCandidate) {
        const emailRes = normalizeEmail(String(emailCandidate).trim());
        if (emailRes.isValid) {
          extractedEmail = emailRes.normalized;
          canonicalData.EMAIL = emailRes.normalized;
          bitrixFields.EMAIL = [{ VALUE: emailRes.normalized, VALUE_TYPE: 'WORK' }];
        }
      }
    }

    if (!extractedPhone) {
      const phoneCandidate =
        normalizedRowValues['số điện thoại'] ||
        normalizedRowValues['điện thoại'] ||
        normalizedRowValues['sđt'] ||
        normalizedRowValues['phone'] ||
        normalizedRowValues['mobile'];
      if (phoneCandidate) {
        const phoneRes = normalizeVietnamesePhone(String(phoneCandidate).trim());
        if (phoneRes.isValid) {
          extractedPhone = phoneRes.normalized;
          canonicalData.PHONE = phoneRes.normalized;
          bitrixFields.PHONE = [{ VALUE: phoneRes.normalized, VALUE_TYPE: 'WORK' }];
        }
      }
    }

    if (!extractedName) {
      const nameCandidate =
        normalizedRowValues['tên khách hàng'] ||
        normalizedRowValues['họ và tên'] ||
        normalizedRowValues['họ tên'] ||
        normalizedRowValues['tên'] ||
        normalizedRowValues['name'];
      if (nameCandidate) {
        extractedName = String(nameCandidate).trim();
        if (!bitrixFields.NAME) {
          bitrixFields.NAME = extractedName;
          canonicalData.NAME = extractedName;
        }
      }
    }

    if (!bitrixFields.COMPANY_TITLE) {
      const companyCandidate = normalizedRowValues['công ty'] || normalizedRowValues['doanh nghiệp'];
      if (companyCandidate) {
        bitrixFields.COMPANY_TITLE = String(companyCandidate).trim();
        canonicalData.COMPANY_TITLE = bitrixFields.COMPANY_TITLE;
      }
    }

    if (!bitrixFields.STATUS_ID) {
      const statusCandidate = normalizedRowValues['trạng thái'] || normalizedRowValues['status'];
      if (statusCandidate) {
        const rawStatus = String(statusCandidate).trim();
        const statusMap: Record<string, string> = {
          'mới': 'NEW',
          'chưa xử lý': 'NEW',
          'đang liên hệ': 'IN_PROCESS',
          'đang xử lý': 'IN_PROCESS',
          'đã xử lý': 'PROCESSED',
          'hoàn thành': 'CONVERTED',
          'không tiềm năng': 'JUNK',
        };
        const mapped = statusMap[rawStatus.toLowerCase()] || rawStatus;
        bitrixFields.STATUS_ID = mapped;
        canonicalData.STATUS_ID = mapped;
      }
    }

    if (!bitrixFields.ASSIGNED_BY_ID) {
      const assignedCandidate = normalizedRowValues['người phụ trách'] || normalizedRowValues['assigned by'] || normalizedRowValues['phụ trách'];
      if (assignedCandidate) {
        const num = parseInt(String(assignedCandidate).trim(), 10);
        if (!isNaN(num)) {
          bitrixFields.ASSIGNED_BY_ID = num;
          canonicalData.ASSIGNED_BY_ID = num;
        }
      }
    }

    // Auto-generates TITLE if missing from available row details
    if (!bitrixFields.TITLE) {
      const fallbackTitle =
        extractedTitle ||
        extractedName ||
        rowValues['Họ và tên'] ||
        rowValues['Tên khách hàng'] ||
        rowValues['Công ty'] ||
        (extractedPhone ? `Lead ${extractedPhone}` : '') ||
        (extractedEmail ? `Lead ${extractedEmail}` : '') ||
        'Khách hàng tiềm năng';
      bitrixFields.TITLE = fallbackTitle;
      canonicalData.TITLE = fallbackTitle;
      extractedTitle = fallbackTitle;
    }

    // Ensures at least one communication channel or identity exists for lead contact
    if (!extractedEmail && !extractedPhone && !extractedName && errors.length === 0) {
      errors.push(ERROR_MESSAGES_VI.MISSING_CONTACT_INFO);
    }

    return {
      success: errors.length === 0,
      bitrixFields,
      canonicalData,
      errors,
      email: extractedEmail,
      phone: extractedPhone,
      title: extractedTitle,
      name: extractedName,
    };
  }

  // Maps Bitrix24 Lead object back into Google Sheet column key-value pairs
  transformBitrixToRow(bitrixLead: Record<string, any>): Record<string, any> {
    const rowData: Record<string, any> = {};

    for (const field of this.config.fields) {
      const rawBitrixValue = bitrixLead[field.bitrixField];

      if (field.type === 'multifield') {
        if (Array.isArray(rawBitrixValue) && rawBitrixValue.length > 0) {
          rowData[field.sheetColumn] = rawBitrixValue[0]?.VALUE || '';
        } else if (typeof rawBitrixValue === 'string') {
          rowData[field.sheetColumn] = rawBitrixValue;
        }
        continue;
      }

      if (field.type === 'enum' && field.valueMapping) {
        // Reverse enum lookup
        let matchedKey = '';
        for (const [sheetKey, b24Val] of Object.entries(field.valueMapping)) {
          if (b24Val === rawBitrixValue) {
            matchedKey = sheetKey;
            break;
          }
        }
        rowData[field.sheetColumn] = matchedKey || String(rawBitrixValue || '');
        continue;
      }

      if (rawBitrixValue !== undefined && rawBitrixValue !== null) {
        rowData[field.sheetColumn] = String(rawBitrixValue);
      }
    }

    return rowData;
  }

  // Validates schema structure of mapping.json
  private validateConfig(config: MappingConfiguration): void {
    if (!Array.isArray(config.fields) || config.fields.length === 0) {
      throw new Error('mapping.json must define a non-empty fields array');
    }
    for (const field of config.fields) {
      if (!field.sheetColumn || !field.bitrixField || !field.type) {
        throw new Error(`Invalid mapping entry: ${JSON.stringify(field)}`);
      }
    }
  }
}

