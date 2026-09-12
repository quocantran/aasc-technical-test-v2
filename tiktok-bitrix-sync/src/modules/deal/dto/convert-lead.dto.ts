import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber } from 'class-validator';

export class ConvertLeadDto {
  @ApiPropertyOptional({ description: 'Custom deal title override' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Pipeline funnel ID (default: 0)' })
  @IsOptional()
  @IsString()
  pipeline_id?: string;

  @ApiPropertyOptional({ description: 'Target stage ID (e.g. NEW, PREPARATION)' })
  @IsOptional()
  @IsString()
  stage_id?: string;

  @ApiPropertyOptional({ description: 'Deal opportunity amount in VND' })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ description: 'Currency (default: VND)' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Win probability percentage (0-100)' })
  @IsOptional()
  @IsNumber()
  probability?: number;

  @ApiPropertyOptional({ description: 'Assigned Bitrix24 user ID' })
  @IsOptional()
  @IsString()
  assigned_to?: string;
}
