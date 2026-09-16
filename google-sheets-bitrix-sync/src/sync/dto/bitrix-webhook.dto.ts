import { IsNotEmpty, IsOptional, IsString, IsObject } from 'class-validator';

// Nested Auth DTO for Bitrix24 webhook authentication details
export class BitrixWebhookAuthDto {
  @IsOptional()
  @IsString()
  application_token?: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsString()
  member_id?: string;

  [key: string]: any;
}

// DTO representing Bitrix24 outbound webhook event notification payload
export class BitrixWebhookDto {
  @IsNotEmpty({ message: 'Tên sự kiện event là bắt buộc' })
  @IsString({ message: 'Tên sự kiện event phải là chuỗi' })
  event: string;

  @IsOptional()
  @IsObject({ message: 'Trường data phải là một đối tượng' })
  data?: Record<string, any>;

  @IsOptional()
  @IsObject({ message: 'Trường auth phải là một đối tượng' })
  auth?: BitrixWebhookAuthDto;

  @IsOptional()
  @IsString({ message: 'auth_token phải là chuỗi' })
  auth_token?: string;

  @IsOptional()
  ts?: string | number;

  @IsOptional()
  ID?: string | number | (string | number)[];

  [key: string]: any;
}
