// Supported data types for field transformation rules
export type FieldDataType = 'string' | 'number' | 'multifield' | 'enum' | 'custom' | 'date';

// Configuration rule mapping a single Google Sheet column to a Bitrix24 field
export interface FieldMappingConfig {
  sheetColumn: string;
  bitrixField: string;
  type: FieldDataType;
  valueType?: string;
  valueMapping?: Record<string, string>;
  defaultValue?: any;
  required?: boolean;
}

// Complete mapping configuration root loaded from mapping.json
export interface MappingConfiguration {
  fields: FieldMappingConfig[];
}
