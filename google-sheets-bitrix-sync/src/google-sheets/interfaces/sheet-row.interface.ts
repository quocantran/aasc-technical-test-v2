import { SyncStatusVi } from '../../common/constants/sync.constants.js';

// Metadata stored across the 5 system columns in Google Sheets
export interface SheetSystemFields {
  status: SyncStatusVi | string;
  bitrixLeadId: string | number | null;
  lastSyncTime: string | null;
  errorMessage: string | null;
  syncHash: string | null;
}

// Represents a parsed row from Google Sheets with data and system fields
export interface SheetRow {
  rowIndex: number;
  data: Record<string, any>;
  rawValues: any[];
  systemFields: SheetSystemFields;
}

// Payload format for batch write-back updates to Google Sheets
export interface RowUpdatePayload {
  rowIndex: number;
  status: SyncStatusVi | string;
  bitrixLeadId?: string | number | null;
  lastSyncTime?: string;
  errorMessage?: string | null;
  syncHash?: string | null;
}
