import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsNotEmpty, IsArray } from 'class-validator';

export class UpdateMappingDto {
  @ApiProperty({
    description: 'Field mapping dictionary from TikTok payload paths to Bitrix24 fields',
    example: {
      'lead_data.full_name': 'NAME',
      'lead_data.email': 'EMAIL[0][VALUE]',
      'lead_data.phone': 'PHONE[0][VALUE]',
      'lead_data.city': 'UF_CRM_CITY',
      'campaign.campaign_name': 'UF_CRM_UTM_CAMPAIGN',
    },
  })
  @IsObject()
  @IsNotEmpty()
  field_mapping: Record<string, string>;

  @ApiProperty({
    description: 'Merge strategy when updating existing leads: OVERWRITE_EMPTY | ALWAYS_OVERWRITE | KEEP_EXISTING',
    example: 'OVERWRITE_EMPTY',
    required: false,
  })
  merge_strategy?: 'OVERWRITE_EMPTY' | 'ALWAYS_OVERWRITE' | 'KEEP_EXISTING';
}

export class UpdateRulesDto {
  @ApiProperty({
    description: 'Array of deal conversion rules evaluated against incoming leads',
    example: [
      {
        id: 'rule_spring_sale',
        condition: "campaign.campaign_name CONTAINS 'sale'",
        action: 'create_deal',
        pipeline_id: '1',
        stage_id: 'NEW',
        probability: 30,
      },
    ],
  })
  @IsArray()
  @IsNotEmpty()
  deal_rules: any[];
}
