import { IsNotEmpty, IsString } from 'class-validator';

// DTO for query parameters received on Google OAuth redirect callback
export class GoogleCallbackQueryDto {
  constructor(code?: string) {
    if (code !== undefined) {
      this.code = code;
    }
  }

  @IsNotEmpty({ message: 'Mã ủy quyền (code) không được để trống' })
  @IsString({ message: 'Mã ủy quyền (code) phải là chuỗi' })
  code: string;
}
