import { IsBoolean, IsOptional } from 'class-validator';

// Optional DTO for triggering manual two-way synchronization via POST /api/sync/two-way
export class TwoWaySyncDto {
  constructor(force?: boolean) {
    if (force !== undefined) {
      this.force = force;
    }
  }

  @IsOptional()
  @IsBoolean({ message: 'force phải là kiểu boolean' })
  force?: boolean;
}
