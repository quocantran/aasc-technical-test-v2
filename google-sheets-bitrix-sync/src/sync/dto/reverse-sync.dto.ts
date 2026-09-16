import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

// DTO for triggering reverse synchronization via HTTP request body
export class ReverseSyncDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'leadId phải là một số nguyên dương' })
  @Min(1, { message: 'leadId phải lớn hơn hoặc bằng 1' })
  leadId?: number;
}

// DTO for query parameters on reverse sync trigger
export class ReverseSyncQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'leadId phải là một số nguyên dương' })
  @Min(1, { message: 'leadId phải lớn hơn hoặc bằng 1' })
  leadId?: number;
}
