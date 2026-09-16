import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

// DTO for query parameters when fetching sync execution history logs
export class GetSyncLogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là một số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(100, { message: 'limit tối đa là 100 bản ghi' })
  limit?: number;
}
