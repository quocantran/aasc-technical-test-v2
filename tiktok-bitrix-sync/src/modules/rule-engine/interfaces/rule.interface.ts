export interface DealRule {
  id: string;
  condition: string;
  action: 'create_deal';
  pipeline_id?: string;
  stage_id?: string;
  probability?: number;
  assigned_to?: string;
  title_template?: string;
  amount_calculation?: {
    type: 'fixed' | 'field';
    value: number | string;
    currency?: string;
  };
}

export interface RuleEvaluationResult {
  matched: boolean;
  rule?: DealRule;
  dealData?: {
    title: string;
    pipeline_id: string;
    stage_id: string;
    probability: number;
    amount?: number;
    currency?: string;
    assigned_to?: string;
  };
}
