import { IsBoolean, IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import type { FieldDataType, FieldMappingConfig } from '../interfaces/mapping-config.interface.js';

export const ALLOWED_FIELD_DATA_TYPES: FieldDataType[] = [
  'string',
  'number',
  'multifield',
  'enum',
  'custom',
  'date',
];

// Configuration rule mapping a single Google Sheet column to a Bitrix24 field with validation
export class FieldMappingDto implements FieldMappingConfig {
  @IsNotEmpty({ message: 'sheetColumn không được để trống' })
  @IsString({ message: 'sheetColumn phải là một chuỗi ký tự' })
  sheetColumn: string;

  @IsNotEmpty({ message: 'bitrixField không được để trống' })
  @IsString({ message: 'bitrixField phải là một chuỗi ký tự' })
  bitrixField: string;

  @IsNotEmpty({ message: 'type không được để trống' })
  @IsIn(ALLOWED_FIELD_DATA_TYPES, {
    message: `type phải là một trong các giá trị: ${ALLOWED_FIELD_DATA_TYPES.join(', ')}`,
  })
  type: FieldDataType;

  @IsOptional()
  @IsString({ message: 'valueType phải là một chuỗi ký tự' })
  valueType?: string;

  @IsOptional()
  @IsObject({ message: 'valueMapping phải là một đối tượng key-value' })
  valueMapping?: Record<string, string>;

  @IsOptional()
  defaultValue?: any;

  @IsOptional()
  @IsBoolean({ message: 'required phải là kiểu boolean' })
  required?: boolean;
}
