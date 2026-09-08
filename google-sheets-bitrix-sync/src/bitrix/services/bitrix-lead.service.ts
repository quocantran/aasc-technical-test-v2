import { Injectable } from '@nestjs/common';
import qs from 'qs';
import { BitrixService } from './bitrix.service.js';
import { BITRIX_API_METHODS, BITRIX_CONSTANTS } from '../constants/bitrix-api.constants.js';
import { AppLogger } from '../../common/logger/app-logger.service.js';

// Options for lead creation and update operations
export interface LeadAddOptions {
  REGISTER_SONET_EVENT?: 'Y' | 'N';
}

export interface BatchAddLeadItem {
  key: string;
  fields: Record<string, any>;
  params?: LeadAddOptions;
}

export interface BatchUpdateLeadItem {
  key: string;
  id: number | string;
  fields: Record<string, any>;
  params?: LeadAddOptions;
}

export interface BatchOperationResult<T = any> {
  successes: Record<string, T>;
  errors: Record<string, string>;
}

export interface LeadFieldMetadata {
  field: string;
  label: string;
  group: string;
  type: 'string' | 'number' | 'multifield' | 'enum' | 'date';
  isRequired?: boolean;
  valueType?: string;
  defaultValue?: any;
}

// Built-in standard lead fields catalog with user-friendly Vietnamese labels and category groupings
export const STANDARD_BITRIX_LEAD_FIELDS: LeadFieldMetadata[] = [
  // 1. Thông tin chính
  { field: 'TITLE', label: 'Tên Lead / Tiêu đề Lead', group: 'Thông tin chính', type: 'string', isRequired: true },
  { field: 'NAME', label: 'Tên của khách', group: 'Thông tin cá nhân', type: 'string' },
  { field: 'LAST_NAME', label: 'Họ của khách', group: 'Thông tin cá nhân', type: 'string' },
  { field: 'SECOND_NAME', label: 'Tên đệm / Tên lót', group: 'Thông tin cá nhân', type: 'string' },
  { field: 'HONORIFIC', label: 'Danh xưng / Lời chào', group: 'Thông tin cá nhân', type: 'string' },
  { field: 'BIRTHDATE', label: 'Ngày sinh của khách', group: 'Thông tin cá nhân', type: 'date' },

  // 2. Kênh liên lạc (Multifield)
  { field: 'PHONE', label: 'Số điện thoại', group: 'Thông tin liên hệ', type: 'multifield', valueType: 'WORK' },
  { field: 'EMAIL', label: 'Địa chỉ Email', group: 'Thông tin liên hệ', type: 'multifield', valueType: 'WORK' },
  { field: 'WEB', label: 'Website cá nhân / doanh nghiệp', group: 'Thông tin liên hệ', type: 'multifield', valueType: 'WORK' },
  { field: 'IM', label: 'Tài khoản Chat (Zalo, Skype...)', group: 'Thông tin liên hệ', type: 'multifield', valueType: 'WORK' },

  // 3. Doanh nghiệp & Vị trí công tác
  { field: 'COMPANY_TITLE', label: 'Tên công ty / Doanh nghiệp', group: 'Doanh nghiệp & Công việc', type: 'string' },
  { field: 'POST', label: 'Chức danh / Chức vụ', group: 'Doanh nghiệp & Công việc', type: 'string' },

  // 4. Bán hàng, Cơ hội & Trạng thái
  { field: 'STATUS_ID', label: 'Trạng thái Lead', group: 'Bán hàng & Trạng thái', type: 'enum', defaultValue: 'NEW' },
  { field: 'STATUS_DESCRIPTION', label: 'Diễn giải trạng thái', group: 'Bán hàng & Trạng thái', type: 'string' },
  { field: 'OPPORTUNITY', label: 'Doanh số / Ngân sách kỳ vọng', group: 'Bán hàng & Trạng thái', type: 'number', defaultValue: 0 },
  { field: 'CURRENCY_ID', label: 'Loại tiền tệ (VND, USD)', group: 'Bán hàng & Trạng thái', type: 'string', defaultValue: 'VND' },
  { field: 'ASSIGNED_BY_ID', label: 'ID nhân viên phụ trách', group: 'Bán hàng & Trạng thái', type: 'number', defaultValue: 1 },
  { field: 'OPENED', label: 'Công khai cho toàn bộ công ty (Y/N)', group: 'Bán hàng & Trạng thái', type: 'string', defaultValue: 'Y' },

  // 5. Nguồn tiếp thị & Marketing (UTM)
  { field: 'SOURCE_ID', label: 'Nguồn Lead (Website, Facebook...)', group: 'Nguồn & Tiếp thị', type: 'enum', defaultValue: 'OTHER' },
  { field: 'SOURCE_DESCRIPTION', label: 'Diễn giải chi tiết nguồn', group: 'Nguồn & Tiếp thị', type: 'string' },
  { field: 'UTM_SOURCE', label: 'Kênh tiếp thị (UTM Source)', group: 'Nguồn & Tiếp thị', type: 'string' },
  { field: 'UTM_MEDIUM', label: 'Hình thức tiếp thị (UTM Medium)', group: 'Nguồn & Tiếp thị', type: 'string' },
  { field: 'UTM_CAMPAIGN', label: 'Chiến dịch (UTM Campaign)', group: 'Nguồn & Tiếp thị', type: 'string' },
  { field: 'UTM_CONTENT', label: 'Nội dung quảng cáo (UTM Content)', group: 'Nguồn & Tiếp thị', type: 'string' },
  { field: 'UTM_TERM', label: 'Từ khóa tìm kiếm (UTM Term)', group: 'Nguồn & Tiếp thị', type: 'string' },

  // 6. Địa chỉ
  { field: 'ADDRESS', label: 'Địa chỉ số nhà / tên đường', group: 'Địa chỉ & Vị trí', type: 'string' },
  { field: 'ADDRESS_CITY', label: 'Quận / Huyện / Thành phố', group: 'Địa chỉ & Vị trí', type: 'string' },
  { field: 'ADDRESS_REGION', label: 'Tỉnh / Thành phố trực thuộc', group: 'Địa chỉ & Vị trí', type: 'string' },
  { field: 'ADDRESS_PROVINCE', label: 'Tỉnh / Vùng', group: 'Địa chỉ & Vị trí', type: 'string' },
  { field: 'ADDRESS_POSTAL_CODE', label: 'Mã bưu điện (Zip/Postal Code)', group: 'Địa chỉ & Vị trí', type: 'string' },
  { field: 'ADDRESS_COUNTRY', label: 'Quốc gia', group: 'Địa chỉ & Vị trí', type: 'string' },

  // 7. Ghi chú & Khác
  { field: 'COMMENTS', label: 'Ghi chú / Bình luận về Lead', group: 'Ghi chú & Khác', type: 'string' },
];

// Encapsulates Bitrix24 CRM Lead CRUD operations and deduplication queries
@Injectable()
export class BitrixLeadService {
  constructor(
    private readonly bitrixService: BitrixService,
    private readonly logger: AppLogger,
  ) {}

  // Creates a new lead in Bitrix24 and returns the created lead ID
  async addLead(fields: Record<string, any>, params?: LeadAddOptions): Promise<number> {
    this.logger.debug(`Creating lead in Bitrix24: ${fields.TITLE || 'Untitled'}`, 'BitrixLeadService');
    const result = await this.bitrixService.callMethod<number | string>(BITRIX_API_METHODS.LEAD_ADD, {
      fields,
      params: params ?? { REGISTER_SONET_EVENT: 'N' },
    });
    return Number(result);
  }

  // Updates fields of an existing lead by ID
  async updateLead(
    id: number | string,
    fields: Record<string, any>,
    params?: LeadAddOptions,
  ): Promise<boolean> {
    this.logger.debug(`Updating lead #${id} in Bitrix24`, 'BitrixLeadService');
    const result = await this.bitrixService.callMethod<boolean>(BITRIX_API_METHODS.LEAD_UPDATE, {
      id: Number(id),
      fields,
      params: params ?? { REGISTER_SONET_EVENT: 'N' },
    });
    return Boolean(result);
  }

  // Executes bulk lead additions using Bitrix24 batch REST method (chunked to max 50 items/batch)
  async batchAddLeads(items: BatchAddLeadItem[]): Promise<BatchOperationResult<number>> {
    if (items.length === 0) {
      return { successes: {}, errors: {} };
    }

    this.logger.debug(`Executing batch add for ${items.length} leads in Bitrix24`, 'BitrixLeadService');
    const totalSuccesses: Record<string, number> = {};
    const totalErrors: Record<string, string> = {};
    const chunkSize = BITRIX_CONSTANTS.MAX_BATCH_COMMANDS;

    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const commands: Record<string, string> = {};
      for (const item of chunk) {
        const payload: Record<string, any> = {
          fields: item.fields,
          params: item.params ?? { REGISTER_SONET_EVENT: 'N' },
        };
        const queryStr = qs.stringify(payload, { encode: true });
        commands[item.key] = `${BITRIX_API_METHODS.LEAD_ADD}?${queryStr}`;
      }

      const batchRes = await this.bitrixService.executeBatch(commands, false);

      if (batchRes.result) {
        for (const [k, val] of Object.entries(batchRes.result)) {
          if (val !== undefined && val !== null) {
            totalSuccesses[k] = Number(val);
          }
        }
      }

      if (batchRes.result_error) {
        for (const [k, err] of Object.entries(batchRes.result_error)) {
          const desc = typeof err === 'object' ? (err as any)?.error_description || (err as any)?.error || JSON.stringify(err) : String(err);
          totalErrors[k] = desc;
        }
      }
    }

    return { successes: totalSuccesses, errors: totalErrors };
  }

  // Executes bulk lead updates using Bitrix24 batch REST method (chunked to max 50 items/batch)
  async batchUpdateLeads(items: BatchUpdateLeadItem[]): Promise<BatchOperationResult<boolean>> {
    if (items.length === 0) {
      return { successes: {}, errors: {} };
    }

    this.logger.debug(`Executing batch update for ${items.length} leads in Bitrix24`, 'BitrixLeadService');
    const totalSuccesses: Record<string, boolean> = {};
    const totalErrors: Record<string, string> = {};
    const chunkSize = BITRIX_CONSTANTS.MAX_BATCH_COMMANDS;

    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const commands: Record<string, string> = {};
      for (const item of chunk) {
        const payload: Record<string, any> = {
          id: Number(item.id),
          fields: item.fields,
          params: item.params ?? { REGISTER_SONET_EVENT: 'N' },
        };
        const queryStr = qs.stringify(payload, { encode: true });
        commands[item.key] = `${BITRIX_API_METHODS.LEAD_UPDATE}?${queryStr}`;
      }

      const batchRes = await this.bitrixService.executeBatch(commands, false);

      if (batchRes.result) {
        for (const [k, val] of Object.entries(batchRes.result)) {
          totalSuccesses[k] = Boolean(val);
        }
      }

      if (batchRes.result_error) {
        for (const [k, err] of Object.entries(batchRes.result_error)) {
          const desc = typeof err === 'object' ? (err as any)?.error_description || (err as any)?.error || JSON.stringify(err) : String(err);
          totalErrors[k] = desc;
        }
      }
    }

    return { successes: totalSuccesses, errors: totalErrors };
  }

  // Retrieves lead details or returns null if lead does not exist
  async getLead(id: number | string): Promise<Record<string, any> | null> {
    try {
      this.logger.debug(`Retrieving lead #${id} from Bitrix24`, 'BitrixLeadService');
      const result = await this.bitrixService.callMethod<Record<string, any>>(
        BITRIX_API_METHODS.LEAD_GET,
        { id: Number(id) },
      );
      return result || null;
    } catch (error: any) {
      const errDesc =
        error?.response?.data?.error_description ||
        error?.response?.data?.error ||
        error?.message ||
        '';
      const isNotFound =
        error?.response?.status === 404 ||
        (error?.response?.status === 400 && String(errDesc).toLowerCase().includes('not found')) ||
        String(errDesc).includes('Not found') ||
        String(errDesc).includes('NOT_FOUND') ||
        String(errDesc).includes('ERROR_CORE');

      if (isNotFound) {
        return null;
      }
      throw error;
    }
  }

  // Fetches lead list matching filter criteria
  async listLeads(filter: Record<string, any>, select?: string[]): Promise<any[]> {
    this.logger.debug(`Listing leads from Bitrix24 with filter`, 'BitrixLeadService');
    const result = await this.bitrixService.callMethod<any[]>(BITRIX_API_METHODS.LEAD_LIST, {
      filter,
      select: select ?? ['ID', 'TITLE', 'NAME', 'EMAIL', 'PHONE', 'DATE_CREATE', 'DATE_MODIFY', 'STATUS_ID', 'COMPANY_TITLE', 'OPPORTUNITY', 'COMMENTS'],
    });
    return result || [];
  }

  // Deletes a lead entity by ID
  async deleteLead(id: number | string): Promise<boolean> {
    this.logger.debug(`Deleting lead #${id} from Bitrix24`, 'BitrixLeadService');
    const result = await this.bitrixService.callMethod<boolean>(BITRIX_API_METHODS.LEAD_DELETE, {
      id: Number(id),
    });
    return Boolean(result);
  }

  // Batch queries duplicate leads mapping each email and phone directly to lead IDs (O(1) in-memory lookup)
  async findDuplicatesMap(
    emails: string[],
    phones: string[],
  ): Promise<{ emailMap: Record<string, number>; phoneMap: Record<string, number> }> {
    const validEmails = Array.from(new Set(emails.filter((e) => e && e.trim() !== '')));
    const validPhones = Array.from(new Set(phones.filter((p) => p && p.trim() !== '')));

    const emailMap: Record<string, number> = {};
    const phoneMap: Record<string, number> = {};

    if (validEmails.length === 0 && validPhones.length === 0) {
      return { emailMap, phoneMap };
    }

    const commands: Record<string, { type: 'EMAIL' | 'PHONE'; value: string; cmd: string }> = {};
    let cmdIdx = 0;

    for (const email of validEmails) {
      const key = `em_${cmdIdx++}`;
      commands[key] = {
        type: 'EMAIL',
        value: email,
        cmd: `${BITRIX_API_METHODS.DUPLICATE_FINDBYCOMM}?${qs.stringify({ type: 'EMAIL', values: [email], entity_type: 'LEAD' }, { encode: true })}`,
      };
    }

    for (const phone of validPhones) {
      const key = `ph_${cmdIdx++}`;
      commands[key] = {
        type: 'PHONE',
        value: phone,
        cmd: `${BITRIX_API_METHODS.DUPLICATE_FINDBYCOMM}?${qs.stringify({ type: 'PHONE', values: [phone], entity_type: 'LEAD' }, { encode: true })}`,
      };
    }

    const commandKeys = Object.keys(commands);
    const chunkSize = BITRIX_CONSTANTS.MAX_BATCH_COMMANDS;

    for (let i = 0; i < commandKeys.length; i += chunkSize) {
      const chunkKeys = commandKeys.slice(i, i + chunkSize);
      const batchCmds: Record<string, string> = {};
      for (const k of chunkKeys) {
        batchCmds[k] = commands[k].cmd;
      }

      const res = await this.bitrixService.executeBatch(batchCmds, false);
      if (res.result) {
        for (const [k, leadData] of Object.entries(res.result)) {
          const meta = commands[k];
          if (meta && leadData && Array.isArray((leadData as any).LEAD) && (leadData as any).LEAD.length > 0) {
            const matchedId = Number((leadData as any).LEAD[0]);
            if (meta.type === 'EMAIL') {
              emailMap[meta.value.toLowerCase()] = matchedId;
            } else if (meta.type === 'PHONE') {
              phoneMap[meta.value] = matchedId;
            }
          }
        }
      }
    }

    return { emailMap, phoneMap };
  }

  // Queries matching lead IDs by email or phone values in batches of 20
  async findByCommunication(type: 'EMAIL' | 'PHONE', values: string[]): Promise<number[]> {
    const validValues = values.filter((v) => v && v.trim() !== '');
    if (validValues.length === 0) {
      return [];
    }

    const matchedLeadIds = new Set<number>();
    const chunkSize = BITRIX_CONSTANTS.MAX_FINDBYCOMM_VALUES;

    for (let i = 0; i < validValues.length; i += chunkSize) {
      const chunk = validValues.slice(i, i + chunkSize);
      const result = await this.bitrixService.callMethod<any>(
        BITRIX_API_METHODS.DUPLICATE_FINDBYCOMM,
        {
          type,
          values: chunk,
          entity_type: 'LEAD',
        },
      );

      if (result && Array.isArray(result.LEAD)) {
        result.LEAD.forEach((leadId: any) => matchedLeadIds.add(Number(leadId)));
      }
    }

    return Array.from(matchedLeadIds);
  }

  // Retrieves list of writable lead fields, dynamically querying Bitrix24 or falling back to standard catalog
  async getLeadFields(): Promise<LeadFieldMetadata[]> {
    try {
      const rawFields = await this.bitrixService.callMethod<Record<string, any>>(BITRIX_API_METHODS.LEAD_FIELDS);
      if (!rawFields || typeof rawFields !== 'object') {
        return STANDARD_BITRIX_LEAD_FIELDS;
      }

      const standardMap = new Map(STANDARD_BITRIX_LEAD_FIELDS.map((f) => [f.field, f]));
      const resultList: LeadFieldMetadata[] = [];

      // Include all standard writable fields
      for (const std of STANDARD_BITRIX_LEAD_FIELDS) {
        const remote = rawFields[std.field];
        if (!remote || remote.isReadOnly !== true) {
          resultList.push(std);
        }
      }

      // Discover custom fields (UF_CRM_*) and extra writable fields defined in portal
      for (const [key, meta] of Object.entries(rawFields)) {
        if (standardMap.has(key)) continue;
        if (meta && typeof meta === 'object' && meta.isReadOnly === true) continue;

        let detectedType: LeadFieldMetadata['type'] = 'string';
        const rawType = String((meta as any)?.type || '').toLowerCase();
        if (rawType.includes('multifield')) detectedType = 'multifield';
        else if (rawType.includes('double') || rawType.includes('integer')) detectedType = 'number';
        else if (rawType.includes('status') || rawType.includes('enumeration')) detectedType = 'enum';
        else if (rawType.includes('date')) detectedType = 'date';

        const isCustom = key.startsWith('UF_CRM_');
        const title = (meta as any)?.title || (meta as any)?.listLabel || key;
        resultList.push({
          field: key,
          label: `${title} [${key}]`,
          group: isCustom ? 'Trường tùy biến (Custom Fields)' : 'Trường Bitrix24 khác',
          type: detectedType,
          isRequired: Boolean((meta as any)?.isRequired),
        });
      }

      return resultList;
    } catch (error: any) {
      this.logger.warn(
        `Could not fetch live lead fields from Bitrix24: ${error.message}, falling back to standard catalog`,
        'BitrixLeadService',
      );
      return STANDARD_BITRIX_LEAD_FIELDS;
    }
  }
}


