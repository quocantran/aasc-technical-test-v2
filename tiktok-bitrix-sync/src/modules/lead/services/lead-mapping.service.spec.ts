import { LeadMappingService } from './lead-mapping.service';
import { ConfigService } from '../../config-mgmt/services/config.service';
import { RuleEvaluatorService } from '../../rule-engine/services/rule-evaluator.service';
import { AppLogger } from '../../../common/logger/app-logger.service';

describe('LeadMappingService', () => {
  let service: LeadMappingService;
  let configService: ConfigService;
  let ruleEvaluator: RuleEvaluatorService;

  beforeEach(() => {
    const mockLogger = {
      debug: () => {},
      warn: () => {},
      log: () => {},
      error: () => {},
    } as any as AppLogger;

    ruleEvaluator = new RuleEvaluatorService(mockLogger);
    configService = {
      getFieldMappings: async () => ({
        field_mapping: {
          'lead_data.full_name': 'NAME',
          'lead_data.email': 'EMAIL[0][VALUE]',
          'lead_data.phone': 'PHONE[0][VALUE]',
          'lead_data.city': 'UF_CRM_CITY',
          'campaign.campaign_name': 'UF_CRM_UTM_CAMPAIGN',
          'campaign.ad_name': 'UF_CRM_AD_NAME',
          'lead_data.ttclid': 'UF_CRM_TTCLID',
        },
      }),
    } as any as ConfigService;

    service = new LeadMappingService(configService, ruleEvaluator);
  });

  it('should correctly map raw TikTok payload into Bitrix24 fields format', async () => {
    const payload = {
      campaign: {
        campaign_name: 'Spring Sale 2026',
        ad_name: 'Product Demo Video',
      },
      lead_data: {
        full_name: 'Nguyen Van A',
        email: 'nguyenvana@email.com',
        phone: '+84901234567',
        city: 'Ha Noi',
        ttclid: 'TT-abc123xyz789',
        utm_source: 'tiktok',
        utm_campaign: 'spring_sale_2026',
      },
    };

    const res = await service.mapTikTokToBitrix(payload);

    expect(res.NAME).toBe('Nguyen Van A');
    expect(res.UF_CRM_CITY).toBe('Ha Noi');
    expect(res.UF_CRM_UTM_CAMPAIGN).toBe('Spring Sale 2026');
    expect(res.UF_CRM_AD_NAME).toBe('Product Demo Video');
    expect(res.UF_CRM_TTCLID).toBe('TT-abc123xyz789');

    // Multifield format
    expect(res.PHONE).toEqual([{ VALUE: '+84901234567', VALUE_TYPE: 'WORK' }]);
    expect(res.EMAIL).toEqual([{ VALUE: 'nguyenvana@email.com', VALUE_TYPE: 'WORK' }]);

    expect(res.SOURCE_ID).toBe('TIKTOK');
    expect(res.UTM_SOURCE).toBe('tiktok');
  });

  it('should handle missing config field_mapping and fallback to payload phone/email/ttclid', async () => {
    (configService.getFieldMappings as any) = async () => ({});

    const payload = {
      lead_data: {
        phone: '0987654321',
        email: 'fallback@example.com',
        ttclid: 'ttclid_direct',
      },
    };

    const res = await service.mapTikTokToBitrix(payload);

    expect(res.TITLE).toBe('TikTok Lead: Anonymous');
    expect(res.SOURCE_DESCRIPTION).toBe('TikTok Campaign: Direct');
    expect(res.PHONE).toEqual([{ VALUE: '0987654321', VALUE_TYPE: 'WORK' }]);
    expect(res.EMAIL).toEqual([{ VALUE: 'fallback@example.com', VALUE_TYPE: 'WORK' }]);
    expect(res.UF_CRM_TTCLID).toBe('ttclid_direct');
  });

  it('should skip null, undefined, or empty mapped values gracefully', async () => {
    (configService.getFieldMappings as any) = async () => ({
      field_mapping: {
        'empty_field': 'UF_CRM_EMPTY',
      },
    });

    const res = await service.mapTikTokToBitrix({});
    expect(res.TITLE).toBe('TikTok Lead: Anonymous');
    expect(res.UF_CRM_EMPTY).toBeUndefined();
  });
});

