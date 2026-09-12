import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../common/logger/app-logger.service';
import { DealRule, RuleEvaluationResult } from '../interfaces/rule.interface';

// Operator strategy contract for Open/Closed Principle (OCP) extensible evaluations
export type OperatorStrategy = (actual: any, target: string) => boolean;

export class OperatorRegistry {
  private static readonly strategies: Record<string, OperatorStrategy> = {
    CONTAINS: (actual, target) => {
      if (Array.isArray(actual)) {
        return actual.some((v) => String(v).toLowerCase().includes(target.toLowerCase()));
      }
      return String(actual ?? '').toLowerCase().includes(target.toLowerCase());
    },
    NOT_CONTAINS: (actual, target) => !String(actual ?? '').toLowerCase().includes(target.toLowerCase()),
    '==': (actual, target) => String(actual ?? '').toLowerCase() === target.toLowerCase(),
    '=': (actual, target) => String(actual ?? '').toLowerCase() === target.toLowerCase(),
    '!=': (actual, target) => String(actual ?? '').toLowerCase() !== target.toLowerCase(),
    '>': (actual, target) => Number(actual) > Number(target),
    '>=': (actual, target) => Number(actual) >= Number(target),
    '<': (actual, target) => Number(actual) < Number(target),
    '<=': (actual, target) => Number(actual) <= Number(target),
    IN: (actual, target) => {
      if (Array.isArray(actual)) {
        return actual.map(String).includes(target);
      }
      return String(actual ?? '').toLowerCase().includes(target.toLowerCase());
    },
    REGEX: (actual, target) => {
      try {
        return new RegExp(target, 'i').test(String(actual ?? ''));
      } catch {
        return false;
      }
    },
  };

  static get(operator: string): OperatorStrategy | undefined {
    return this.strategies[operator];
  }

  static register(operator: string, strategy: OperatorStrategy): void {
    this.strategies[operator] = strategy;
  }
}

@Injectable()
export class RuleEvaluatorService {
  private readonly operators = [
    'CONTAINS',
    'NOT_CONTAINS',
    '==',
    '!=',
    '=',
    '>=',
    '<=',
    '>',
    '<',
    'IN',
    'REGEX',
  ];

  constructor(private readonly logger: AppLogger) {}

  // Evaluates a list of rules against lead context and returns first match.
  evaluateRules(rules: DealRule[], context: Record<string, any>): RuleEvaluationResult {
    for (const rule of rules) {
      if (this.evaluateCondition(rule.condition, context)) {
        this.logger.debug(
          `Rule matched: [${rule.id}] "${rule.condition}"`,
          'RuleEvaluatorService',
        );

        const title = this.interpolateTemplate(
          rule.title_template || 'Deal: {{lead_data.full_name}} - {{campaign.campaign_name}}',
          context,
        );

        let amount: number | undefined;
        if (rule.amount_calculation) {
          if (rule.amount_calculation.type === 'fixed') {
            amount = Number(rule.amount_calculation.value);
          } else if (rule.amount_calculation.type === 'field') {
            const val = this.resolvePath(context, String(rule.amount_calculation.value));
            amount = val ? Number(val) : undefined;
          }
        }

        return {
          matched: true,
          rule,
          dealData: {
            title,
            pipeline_id: rule.pipeline_id || '0',
            stage_id: rule.stage_id || 'NEW',
            probability: rule.probability ?? 0,
            amount,
            currency: rule.amount_calculation?.currency || 'VND',
            assigned_to: rule.assigned_to || '1',
          },
        };
      }
    }

    return { matched: false };
  }

  // Evaluates compound boolean conditions with AND / OR precedence.
  evaluateCondition(conditionStr: string, context: Record<string, any>): boolean {
    if (!conditionStr || conditionStr.trim() === '') {
      return true;
    }

    // Split by OR first (lower precedence)
    const orClauses = conditionStr.split(/\s+OR\s+/i);
    for (const orClause of orClauses) {
      // Split by AND (higher precedence)
      const andClauses = orClause.split(/\s+AND\s+/i);
      const allAndPassed = andClauses.every((clause) =>
        this.evaluateSingleClause(clause.trim(), context),
      );

      if (allAndPassed) {
        return true;
      }
    }

    return false;
  }

  // Evaluates single comparison clause using registered operator strategies (OCP compliant).
  evaluateSingleClause(clause: string, context: Record<string, any>): boolean {
    let matchedOp: string | null = null;
    let fieldPath = '';
    let targetValue = '';

    for (const op of this.operators) {
      const regex = new RegExp(`^(.+?)\\s+${op}\\s+(.+)$`, 'i');
      const match = clause.match(regex);
      if (match) {
        matchedOp = op.toUpperCase();
        fieldPath = match[1].trim();
        targetValue = match[2].trim().replace(/^['"]|['"]$/g, ''); // strip outer quotes
        break;
      }
    }

    if (!matchedOp) {
      this.logger.warn(`Cannot parse rule clause: "${clause}"`, 'RuleEvaluatorService');
      return false;
    }

    const actualValue = this.resolvePath(context, fieldPath);
    const strategy = OperatorRegistry.get(matchedOp);
    return strategy ? strategy(actualValue, targetValue) : false;
  }

  // Resolves dot-notation path (e.g. lead_data.name) and scans nested arrays.
  resolvePath(obj: any, path: string): any {
    if (!obj || !path) return undefined;

    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (current === undefined || current === null) {
        return undefined;
      }

      // Check if current is an array (e.g. custom_questions)
      if (Array.isArray(current)) {
        const remainingPath = parts.slice(i).join('.');
        return current.map((item) => this.resolvePath(item, remainingPath)).filter(Boolean);
      }

      current = current[part];
    }

    return current;
  }

  // Mustache-style template interpolation: {{path.to.field}}
  interpolateTemplate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{\s*([\w\.]+)\s*\}\}/g, (match, path) => {
      const val = this.resolvePath(context, path);
      if (val === undefined || val === null) {
        return '';
      }
      if (Array.isArray(val)) {
        return val.join(', ');
      }
      return String(val);
    });
  }
}
