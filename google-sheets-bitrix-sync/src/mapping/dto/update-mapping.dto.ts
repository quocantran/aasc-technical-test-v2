import { ArrayNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { FieldMappingDto } from './field-mapping.dto.js';
import type { MappingConfiguration } from '../interfaces/mapping-config.interface.js';

// DTO for updating the entire field mapping configuration via POST /api/mapping
export class UpdateMappingDto implements MappingConfiguration {
  @IsArray({ message: 'fields phải là một danh sách' })
  @ArrayNotEmpty({ message: 'Danh sách fields không được để trống' })
  @ValidateNested({ each: true })
  @Type(() => FieldMappingDto)
  fields: FieldMappingDto[];
}
