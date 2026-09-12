import { RuleEvaluatorService, OperatorRegistry } from './rule-evaluator.service';
import { AppLogger } from '../../../common/logger/app-logger.service';
import { DealRule } from '../interfaces/rule.interface';

describe('RuleEvaluatorService', () => {
  let service: RuleEvaluatorService;

  beforeEach(() => {
    const mockLogger = {
      debug: () => {},
      warn: () => {},
      log: () => {},
      error: () => {},
    } as any as AppLogger;
    service = new RuleEvaluatorService(mockLogger);
  });

  const sampleContext = {
    campaign: {
      campaign_name: 'Spring Sale 2026',
      campaign_id: '12345',
    },
    lead_data: {
      full_name: 'Nguyen Van A',
      city: 'Ha Noi',
      budget: 15000000,
      interests: ['technology', 'mobile apps'],
    },
    custom_questions: [
      { question: 'Budget range', answer: '5-10 triệu VND' },
      { question: 'Timeline', answer: 'Trong 1 tháng' },
    ],
  };

  it('should match simple CONTAINS rule', () => {
    const rules: DealRule[] = [
      {
        id: 'rule-1',
        condition: "campaign.campaign_name CONTAINS 'sale'",
        action: 'create_deal',
        pipeline_id: '1',
        stage_id: 'NEW',
        probability: 30,
      },
    ];

    const res = service.evaluateRules(rules, sampleContext);
    expect(res.matched).toBe(true);
    expect(res.dealData?.stage_id).toBe('NEW');
    expect(res.dealData?.probability).toBe(30);
  });

  it('should evaluate compound AND / OR condition', () => {
    const rules: DealRule[] = [
      {
        id: 'rule-compound',
        condition: "lead_data.city == 'Da Nang' OR campaign.campaign_name CONTAINS 'Spring' AND lead_data.budget > 10000000",
        action: 'create_deal',
        pipeline_id: '1',
        stage_id: 'PREPARATION',
        probability: 50,
      },
    ];

    const res = service.evaluateRules(rules, sampleContext);
    expect(res.matched).toBe(true);
    expect(res.dealData?.stage_id).toBe('PREPARATION');
  });

  it('should interpolate template variables in deal title including arrays and missing fields', () => {
    const rules: DealRule[] = [
      {
        id: 'rule-template',
        condition: 'lead_data.budget > 10000000',
        action: 'create_deal',
        title_template: 'VIP: {{lead_data.full_name}} - {{lead_data.interests}} - {{missing.field}}',
      },
    ];

    const res = service.evaluateRules(rules, sampleContext);
    expect(res.matched).toBe(true);
    expect(res.dealData?.title).toBe('VIP: Nguyen Van A - technology, mobile apps - ');
  });

  it('should resolve paths through nested arrays like custom_questions', () => {
    const rules: DealRule[] = [
      {
        id: 'rule-array-path',
        condition: "custom_questions.answer CONTAINS '5-10 triệu'",
        action: 'create_deal',
      },
    ];

    const res = service.evaluateRules(rules, sampleContext);
    expect(res.matched).toBe(true);
  });

  it('should calculate deal amount with fixed and field calculations', () => {
    // Fixed amount
    const rulesFixed: DealRule[] = [
      {
        id: 'rule-fixed',
        condition: "lead_data.city == 'Ha Noi'",
        action: 'create_deal',
        amount_calculation: { type: 'fixed', value: 20000000, currency: 'USD' },
      },
    ];
    const resFixed = service.evaluateRules(rulesFixed, sampleContext);
    expect(resFixed.matched).toBe(true);
    expect(resFixed.dealData?.amount).toBe(20000000);
    expect(resFixed.dealData?.currency).toBe('USD');

    // Field amount
    const rulesField: DealRule[] = [
      {
        id: 'rule-field',
        condition: "lead_data.city == 'Ha Noi'",
        action: 'create_deal',
        amount_calculation: { type: 'field', value: 'lead_data.budget' },
      },
    ];
    const resField = service.evaluateRules(rulesField, sampleContext);
    expect(resField.dealData?.amount).toBe(15000000);

    // Field amount missing
    const rulesMissingField: DealRule[] = [
      {
        id: 'rule-missing-field',
        condition: "lead_data.city == 'Ha Noi'",
        action: 'create_deal',
        amount_calculation: { type: 'field', value: 'lead_data.nonexistent' },
      },
    ];
    const resMissing = service.evaluateRules(rulesMissingField, sampleContext);
    expect(resMissing.dealData?.amount).toBeUndefined();
  });

  it('should evaluate all comparison operators correctly', () => {
    // NOT_CONTAINS
    expect(service.evaluateCondition("campaign.campaign_name NOT_CONTAINS 'Winter'", sampleContext)).toBe(true);

    // Equality: '=' and '!='
    expect(service.evaluateCondition("lead_data.city = 'Ha Noi'", sampleContext)).toBe(true);
    expect(service.evaluateCondition("lead_data.city != 'Da Nang'", sampleContext)).toBe(true);

    // Relational: '>=', '<=', '<', '>'
    expect(service.evaluateCondition('lead_data.budget >= 15000000', sampleContext)).toBe(true);
    expect(service.evaluateCondition('lead_data.budget <= 15000000', sampleContext)).toBe(true);
    expect(service.evaluateCondition('lead_data.budget < 20000000', sampleContext)).toBe(true);
    expect(service.evaluateCondition('lead_data.budget > 5000000', sampleContext)).toBe(true);

    // IN with array context and non-array context
    expect(service.evaluateCondition("lead_data.interests IN 'technology'", sampleContext)).toBe(true);
    expect(service.evaluateCondition("lead_data.city IN 'Ha Noi'", sampleContext)).toBe(true);

    // REGEX operator (valid and invalid)
    expect(service.evaluateCondition("lead_data.full_name REGEX '^Nguyen'", sampleContext)).toBe(true);
    expect(service.evaluateCondition("lead_data.full_name REGEX '[invalid(regex'", sampleContext)).toBe(false);

    // Array CONTAINS operator
    expect(service.evaluateCondition("lead_data.interests CONTAINS 'mobile'", sampleContext)).toBe(true);
  });

  it('should return true for empty condition string', () => {
    expect(service.evaluateCondition('', sampleContext)).toBe(true);
    expect(service.evaluateCondition('   ', sampleContext)).toBe(true);
  });

  it('should return false for unparseable clause', () => {
    expect(service.evaluateCondition('just words without operator', sampleContext)).toBe(false);
  });

  it('should support dynamic operator registration via OperatorRegistry', () => {
    OperatorRegistry.register('STARTS_WITH', (actual, target) => String(actual).startsWith(target));
    const fn = OperatorRegistry.get('STARTS_WITH');
    expect(fn).toBeDefined();
    expect(fn!('Hello World', 'Hello')).toBe(true);
  });

  it('should return matched: false if no rules match', () => {
    const rules: DealRule[] = [
      {
        id: 'rule-nomatch',
        condition: "lead_data.city == 'Ho Chi Minh'",
        action: 'create_deal',
      },
    ];

    const res = service.evaluateRules(rules, sampleContext);
    expect(res.matched).toBe(false);
  });
});
