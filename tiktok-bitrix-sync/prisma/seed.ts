import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial configurations...');

  // Default TikTok to Bitrix24 field mapping per TARGET.md
  const defaultFieldMapping = {
    field_mapping: {
      'lead_data.full_name': 'NAME',
      'lead_data.email': 'EMAIL[0][VALUE]',
      'lead_data.phone': 'PHONE[0][VALUE]',
      'lead_data.city': 'UF_CRM_CITY',
      'campaign.campaign_name': 'UF_CRM_UTM_CAMPAIGN',
      'campaign.ad_name': 'UF_CRM_AD_NAME',
      'lead_data.ttclid': 'UF_CRM_TTCLID',
      'lead_data.utm_source': 'UTM_SOURCE',
      'lead_data.utm_campaign': 'UTM_CAMPAIGN',
      'form.form_name': 'COMMENTS',
    },
    merge_strategy: 'OVERWRITE_EMPTY', // OVERWRITE_EMPTY | ALWAYS_OVERWRITE | KEEP_EXISTING
  };

  // Default deal conversion rules per TARGET.md
  const defaultDealRules = [
    {
      id: 'rule_spring_sale',
      condition: "campaign.campaign_name CONTAINS 'sale'",
      action: 'create_deal',
      pipeline_id: '0',
      stage_id: 'NEW',
      probability: 30,
      assigned_to: '1',
      title_template: 'Deal: {{lead_data.full_name}} - {{campaign.campaign_name}}',
      amount_calculation: {
        type: 'fixed',
        value: 5000000,
        currency: 'VND',
      },
    },
    {
      id: 'rule_high_intent',
      condition: "custom_questions.answer CONTAINS '5-10 triệu' OR custom_questions.answer CONTAINS 'Trong 1 tháng'",
      action: 'create_deal',
      pipeline_id: '0',
      stage_id: 'PREPARATION',
      probability: 50,
      assigned_to: '1',
      title_template: 'High Intent Deal: {{lead_data.full_name}}',
      amount_calculation: {
        type: 'fixed',
        value: 10000000,
        currency: 'VND',
      },
    },
  ];

  await prisma.configuration.upsert({
    where: { key: 'field_mapping' },
    update: { value: defaultFieldMapping },
    create: {
      key: 'field_mapping',
      value: defaultFieldMapping,
    },
  });

  await prisma.configuration.upsert({
    where: { key: 'deal_rules' },
    update: { value: defaultDealRules },
    create: {
      key: 'deal_rules',
      value: defaultDealRules,
    },
  });

  // Seed sample campaign metric
  await prisma.campaignMetric.upsert({
    where: { campaignId: '1234567890123456789' },
    update: {},
    create: {
      campaignId: '1234567890123456789',
      campaignName: 'Spring Sale 2026',
      totalLeads: 0,
      syncedLeads: 0,
      convertedDeals: 0,
      wonDeals: 0,
      totalRevenue: 0,
      estimatedCost: 1500000,
    },
  });

  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
