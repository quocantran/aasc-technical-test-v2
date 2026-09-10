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

      // Resolves enumeration value mappings with case-insensitivity, trim, and direct CRM code validation
      if (field.type === 'enum') {
        let mappedValue: string | undefined;

        if (field.valueMapping) {
          if (field.valueMapping[stringValue]) {
            mappedValue = field.valueMapping[stringValue];
          } else {
            const lowerString = stringValue.toLowerCase().trim();
            for (const [mapKey, mapVal] of Object.entries(field.valueMapping)) {
              if (mapKey.toLowerCase().trim() === lowerString) {
                mappedValue = mapVal;
                break;
              }
            }

            if (!mappedValue) {
              const upperString = stringValue.toUpperCase().trim();
              const validCodes = Object.values(field.valueMapping);
              if (validCodes.includes(upperString)) {
                mappedValue = upperString;
              }
            }
          }
        }

        // Invalid enum values return a concise error without silent fallback
        if (!mappedValue) {
          errors.push(
            `Giá trị '${stringValue}' không hợp lệ cho cột '${field.sheetColumn}'. Vui lòng xem lại các giá trị hợp lệ trên Bitrix24.`,
          );
          continue;
        }

        bitrixFields[field.bitrixField] = mappedValue;
        canonicalData[field.bitrixField] = mappedValue;
        continue;
      }

      // Parses and validates numeric values
      if (field.type === 'number') {
        const cleanedNumber = stringValue.replace(/,/g, '');
        const parsedNumber = parseFloat(cleanedNumber);
        if (isNaN(parsedNumber)) {
          errors.push(`Giá trị '${stringValue}' không phải là số hợp lệ cho cột '${field.sheetColumn}'`);
          continue;
        }
        bitrixFields[field.bitrixField] = parsedNumber;
        canonicalData[field.bitrixField] = parsedNumber;
        continue;
      }

      // Parses, validates, and formats date values to YYYY-MM-DD
      if (field.type === 'date') {
        let formattedDate = stringValue;
        const dmyMatch = stringValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        if (dmyMatch) {
          const day = parseInt(dmyMatch[1], 10);
          const month = parseInt(dmyMatch[2], 10);
          const year = parseInt(dmyMatch[3], 10);
          if (month < 1 || month > 12 || day < 1 || day > 31) {
            errors.push(`Giá trị '${stringValue}' không phải là ngày hợp lệ cho cột '${field.sheetColumn}'`);
            continue;
          }
          formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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

    // Generates fallback TITLE for Bitrix24 if TITLE is not explicitly mapped in mapping config
    if (!bitrixFields.TITLE) {
      let fallbackTitle = extractedTitle;
      if (!fallbackTitle) {
        const namePart = extractedName || '';
        const companyPart = bitrixFields.COMPANY_TITLE || '';
        const contactPart = extractedEmail || extractedPhone || '';

        if (namePart && contactPart) {
          fallbackTitle = `${namePart} - ${contactPart}`;
        } else if (namePart && companyPart) {
          fallbackTitle = `${namePart} - ${companyPart}`;
        } else if (namePart) {
          fallbackTitle = namePart;
        } else if (companyPart) {
          fallbackTitle = companyPart;
        } else if (extractedPhone) {
          fallbackTitle = `Lead ${extractedPhone}`;
        } else if (extractedEmail) {
          fallbackTitle = `Lead ${extractedEmail}`;
        } else {
          fallbackTitle = 'Khách hàng tiềm năng';
        }
      }
      bitrixFields.TITLE = fallbackTitle;
      extractedTitle = fallbackTitle;
    }

    // Ensures at least one communication channel (Email or Phone) exists for lead contact
    if (!extractedEmail && !extractedPhone && errors.length === 0) {
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

      if (field.type === 'number' || field.bitrixField === 'OPPORTUNITY') {
        if (rawBitrixValue !== undefined && rawBitrixValue !== null && String(rawBitrixValue).trim() !== '') {
          const num = Number(rawBitrixValue);
          if (!isNaN(num)) {
            // Removes trailing .00 for integer values (e.g. 50000000 instead of 50000000.00)
            rowData[field.sheetColumn] = Number.isInteger(num) ? String(num) : String(parseFloat(num.toFixed(2)));
          } else {
            rowData[field.sheetColumn] = String(rawBitrixValue);
          }
        } else if (field.defaultValue !== undefined) {
          rowData[field.sheetColumn] = String(field.defaultValue);
        }
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

