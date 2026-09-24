import type { ModelCandidate } from '../schemas/navigator.js';
import type { JevEvaluationState } from './types.js';

export function buildSelectionQuestions(candidates: ModelCandidate[]) {
  const criteria = Object.fromEntries(
    candidates.map(c => [
      c.id,
      [
        c.display_name ?? c.id,
        `provider=${c.provider}`,
        c.api_model_id ? `api=${c.api_model_id}` : null,
        c.capabilities?.length ? `caps=${c.capabilities.join(',')}` : null,
        c.context_window ? `ctx=${c.context_window}` : null,
        c.cost_tier ? `cost=${c.cost_tier}` : null,
        c.availability ? `avail=${c.availability}` : null,
      ]
        .filter(Boolean)
        .join('; '),
    ]),
  );

  return {
    selected_model: {
      type: 'choice' as const,
      instructions:
        'Select the single best candidate model for this Issue/PR task. Consider reasoning, code, analysis needs, context size, speed, cost preference, and availability. Only choose a listed candidate id.',
      criteria,
    },
    abstain: {
      type: 'boolean' as const,
      instructions:
        'Should the navigator abstain because no candidate is a safe fit for the task constraints?',
    },
    request_review: {
      type: 'boolean' as const,
      instructions:
        'Should a human review the model selection before any downstream automation uses it?',
    },
  };
}

export interface SummarizedJevState {
  task: string;
  signals: {
    needs_reasoning: boolean;
    needs_code: boolean;
    needs_analysis: boolean;
    estimated_context_tokens: number;
    latency_preference: string;
    source: string;
  };
  budget_preference: string;
  constraints: {
    min_confidence: number;
    decision_only: boolean;
  };
  candidates: Array<{
    id: string;
    provider: string;
    capabilities: string[];
    context_window?: number;
    cost_tier?: string;
    availability?: string;
  }>;
  note: string;
}

export function summarizeState(state: JevEvaluationState): SummarizedJevState {
  return {
    task: state.task,
    signals: {
      needs_reasoning: state.signals.needs_reasoning,
      needs_code: state.signals.needs_code,
      needs_analysis: state.signals.needs_analysis,
      estimated_context_tokens: state.signals.estimated_context_tokens,
      latency_preference: state.signals.latency_preference,
      source: state.signals.source,
    },
    budget_preference: state.budget_preference,
    constraints: {
      min_confidence: state.constraints.min_confidence,
      decision_only: state.constraints.decision_only,
    },
    candidates: state.candidates.map(c => ({
      id: c.id,
      provider: c.provider,
      capabilities: [...(c.capabilities ?? [])],
      context_window: c.context_window,
      cost_tier: c.cost_tier,
      availability: c.availability,
    })),
    note: state.note,
  };
}
