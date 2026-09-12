import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsBoolean, IsDateString } from 'class-validator';

export class BatchMigrateDto {
  @ApiPropertyOptional({ description: 'Number of leads per batch', default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  batchSize?: number = 50;

  @ApiPropertyOptional({ description: 'Maximum total leads to migrate in this job', default: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  limit?: number = 1000;

  @ApiPropertyOptional({ description: 'Force re-sync of already synced leads', default: false })
  @IsOptional()
  @IsBoolean()
  forceReSync?: boolean = false;

  @ApiPropertyOptional({ description: 'Optional start date filter (ISO string)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Optional end date filter (ISO string)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
