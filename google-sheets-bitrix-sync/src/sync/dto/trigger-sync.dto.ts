import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

// DTO for manually triggering forward synchronization via HTTP body
export class TriggerSyncDto {
  @IsOptional()
  @IsBoolean({ message: 'Trường force phải là kiểu boolean' })
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value;
  })
  force?: boolean;
}

// DTO for query parameters on forward sync trigger
export class TriggerSyncQueryDto {
  @IsOptional()
  @IsBoolean({ message: 'Query parameter force phải là kiểu boolean' })
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value;
  })
  force?: boolean;
}
