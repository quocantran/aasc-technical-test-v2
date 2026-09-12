import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CampaignMetadataDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  campaign_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  campaign_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ad_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ad_name?: string;
}

export class FormMetadataDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  form_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  form_name?: string;
}

export class CustomQuestionDto {
  @ApiProperty({ example: 'What is your budget?' })
  @IsString()
  question: string;

  @ApiProperty({ example: '5000000' })
  @IsString()
  answer: string;
}

export class LeadDataDto {
  @ApiPropertyOptional({ example: 'Nguyen Van A' })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiPropertyOptional({ example: 'test@example.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Ha Noi' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: ['technology'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @ApiPropertyOptional({ example: 'tiktok' })
  @IsOptional()
  @IsString()
  utm_source?: string;

  @ApiPropertyOptional({ example: 'spring_sale' })
  @IsOptional()
  @IsString()
  utm_campaign?: string;

  @ApiPropertyOptional({ example: 'TT-abc123xyz' })
  @IsOptional()
  @IsString()
  ttclid?: string;

  [key: string]: any;
}

export class TikTokWebhookDto {
  @ApiProperty({ example: 'lead.generate', description: 'Event action name' })
  @IsString()
  @IsNotEmpty()
  event: string;

  @ApiProperty({ example: 'evt_1234567890', description: 'Unique TikTok event ID' })
  @IsString()
  @IsNotEmpty()
  event_id: string;

  @ApiPropertyOptional({ example: 1709876543, description: 'Timestamp of event' })
  @IsOptional()
  @IsNumber()
  timestamp?: number;

  @ApiPropertyOptional({ example: '7123456789', description: 'Advertiser account ID' })
  @IsOptional()
  @IsString()
  advertiser_id?: string;

  @ApiPropertyOptional({ description: 'Campaign metadata', type: () => CampaignMetadataDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CampaignMetadataDto)
  campaign?: CampaignMetadataDto;

  @ApiPropertyOptional({ description: 'Form metadata', type: () => FormMetadataDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FormMetadataDto)
  form?: FormMetadataDto;

  @ApiPropertyOptional({ description: 'Lead form submitted data', type: () => LeadDataDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LeadDataDto)
  lead_data?: LeadDataDto;

  @ApiPropertyOptional({ description: 'Custom form question answers', type: [CustomQuestionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomQuestionDto)
  custom_questions?: CustomQuestionDto[];
}
