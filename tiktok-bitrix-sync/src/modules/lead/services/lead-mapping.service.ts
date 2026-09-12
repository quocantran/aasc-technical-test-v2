import { Injectable } from '@nestjs/common';
import { ConfigService } from '../..//config-mgmt/services/config.service';
import { BitrixLeadPayload } from '../../bitrix/interfaces/bitrix-adapter.interface';
import { RuleEvaluatorService } from '../../rule-engine/services/rule-evaluator.service';

@Injectable()
export class LeadMappingService {
  constructor(
    private readonly configService: ConfigService,
    private readonly ruleEvaluator: RuleEvaluatorService,
  ) {}

  // Transforms raw TikTok lead data into Bitrix24 format based on field mappings.
  async mapTikTokToBitrix(payload: Record<string, any>): Promise<BitrixLeadPayload> {
    const config = await this.configService.getFieldMappings();
    const mapping: Record<string, string> = config.field_mapping || {};

    const bitrixFields: Record<string, any> = {
      TITLE: `TikTok Lead: ${payload?.lead_data?.full_name || 'Anonymous'}`,
      SOURCE_ID: 'TIKTOK',
      SOURCE_DESCRIPTION: `TikTok Campaign: ${payload?.campaign?.campaign_name || 'Direct'}`,
    };

    let phoneValue: string | undefined;
    let emailValue: string | undefined;

    for (const [tiktokPath, bitrixField] of Object.entries(mapping)) {
      const val = this.ruleEvaluator.resolvePath(payload, tiktokPath);
      if (val === undefined || val === null || val === '') continue;

      if (bitrixField.startsWith('PHONE')) {
        phoneValue = String(val);
      } else if (bitrixField.startsWith('EMAIL')) {
        emailValue = String(val);
      } else {
        bitrixFields[bitrixField] = val;
      }
    }

    // Direct fallback if not specified in mapping
    if (!phoneValue && payload?.lead_data?.phone) {
      phoneValue = payload.lead_data.phone;
    }
    if (!emailValue && payload?.lead_data?.email) {
      emailValue = payload.lead_data.email;
    }

    if (phoneValue) {
      bitrixFields.PHONE = [{ VALUE: phoneValue, VALUE_TYPE: 'WORK' }];
    }
    if (emailValue) {
      bitrixFields.EMAIL = [{ VALUE: emailValue, VALUE_TYPE: 'WORK' }];
    }

    // Preserve UTMs if present
    if (payload?.lead_data?.utm_source) bitrixFields.UTM_SOURCE = payload.lead_data.utm_source;
    if (payload?.lead_data?.utm_campaign) bitrixFields.UTM_CAMPAIGN = payload.lead_data.utm_campaign;
    if (payload?.lead_data?.ttclid && !bitrixFields.UF_CRM_TTCLID) {
      bitrixFields.UF_CRM_TTCLID = payload.lead_data.ttclid;
    }

    return bitrixFields as BitrixLeadPayload;
  }
}
