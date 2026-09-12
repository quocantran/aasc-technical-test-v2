export const BITRIX_ADAPTER = 'BITRIX_ADAPTER';

export interface BitrixLeadPayload {
  TITLE: string;
  NAME?: string;
  LAST_NAME?: string;
  PHONE?: Array<{ VALUE: string; VALUE_TYPE: string }>;
  EMAIL?: Array<{ VALUE: string; VALUE_TYPE: string }>;
  COMMENTS?: string;
  SOURCE_ID?: string;
  SOURCE_DESCRIPTION?: string;
  UTM_SOURCE?: string;
  UTM_MEDIUM?: string;
  UTM_CAMPAIGN?: string;
  UTM_CONTENT?: string;
  UTM_TERM?: string;
  [key: `UF_CRM_${string}`]: any;
}

export interface BitrixDealPayload {
  TITLE: string;
  CATEGORY_ID?: number | string;
  STAGE_ID?: string;
  OPPORTUNITY?: number;
  CURRENCY_ID?: string;
  PROBABILITY?: number;
  ASSIGNED_BY_ID?: number | string;
  COMMENTS?: string;
  CONTACT_IDS?: number[];
  COMPANY_ID?: number;
  OPENED?: 'Y' | 'N';
  CLOSED?: 'Y' | 'N';
  SOURCE_ID?: string;
  SOURCE_DESCRIPTION?: string;
  UTM_SOURCE?: string;
  UTM_MEDIUM?: string;
  UTM_CAMPAIGN?: string;
  UTM_CONTENT?: string;
  ORIGINATOR_ID?: string;
  ORIGIN_ID?: string;
  [key: `UF_CRM_${string}`]: any;
}

export interface BitrixEntityResponse {
  id: number;
  raw?: any;
}

export interface BitrixBatchLeadItem {
  key: string;
  data: BitrixLeadPayload;
}

export interface BitrixBatchResultItem {
  id?: number;
  success: boolean;
  error?: string;
}

export interface IBitrixLeadClient {
  createLead(data: BitrixLeadPayload, options?: { REGISTER_SONET_EVENT?: 'Y' | 'N' }): Promise<BitrixEntityResponse>;
  createLeadsBatch(items: BitrixBatchLeadItem[]): Promise<Record<string, BitrixBatchResultItem>>;
  updateLead(id: number, data: Partial<BitrixLeadPayload>): Promise<boolean>;
  getLead(id: number): Promise<any | null>;
  findDuplicates(type: 'EMAIL' | 'PHONE', values: string[]): Promise<number[]>;
}

export interface IBitrixDealClient {
  createDeal(data: BitrixDealPayload, options?: { REGISTER_SONET_EVENT?: 'Y' | 'N' }): Promise<BitrixEntityResponse>;
  updateDeal(id: number, data: Partial<BitrixDealPayload>): Promise<boolean>;
  getDeal(id: number): Promise<any | null>;
  findDealByOrigin(originatorId: string, originId: string): Promise<BitrixEntityResponse | null>;
  findDealByTitle(title: string): Promise<BitrixEntityResponse | null>;
}

export interface IBitrixNotificationClient {
  addTimelineComment(entityType: 'lead' | 'deal', entityId: number, comment: string): Promise<boolean>;
  sendNotification(userId: number | string, message: string): Promise<boolean>;
}

// Composite CRM adapter interface extending segregated client contracts
export interface IBitrixCrmAdapter extends IBitrixLeadClient, IBitrixDealClient, IBitrixNotificationClient {}

