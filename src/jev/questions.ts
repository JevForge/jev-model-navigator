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
        'Select the single best candidate model for this Issue/PR task. Consider reasoning, code, analysis needs, PR diff signals when present (size, languages, sensitive paths, tests/infra), context size, speed, cost preference, and availability. Only choose a listed candidate id.',
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

export function buildAlternateQuestions(candidates: ModelCandidate[], primaryId: string) {
  const remaining = candidates.filter(c => c.id !== primaryId);
  const criteria = Object.fromEntries(
    remaining.map(c => [
      c.id,
      [
        c.display_name ?? c.id,
        `provider=${c.provider}`,
        c.capabilities?.length ? `caps=${c.capabilities.join(',')}` : null,
        c.cost_tier ? `cost=${c.cost_tier}` : null,
      ]
        .filter(Boolean)
        .join('; '),
    ]),
  );
  return {
    remaining,
    questions: {
      alternate_model: {
        type: 'choice' as const,
        instructions: `Choose the best fallback model if ${primaryId} is unavailable. Choose a different listed candidate.`,
        criteria,
      },
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
  diff?: {
    file_count: number;
    additions: number;
    deletions: number;
    languages: string[];
    top_paths: string[];
    sensitive_paths: string[];
    touch_tests: boolean;
    touch_infra: boolean;
    touch_docs_only: boolean;
    estimated_diff_tokens: number;
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
  const base: SummarizedJevState = {
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
  if (state.signals.diff) {
    base.diff = {
      file_count: state.signals.diff.file_count,
      additions: state.signals.diff.additions,
      deletions: state.signals.diff.deletions,
      languages: [...state.signals.diff.languages],
      top_paths: [...state.signals.diff.top_paths],
      sensitive_paths: [...state.signals.diff.sensitive_paths],
      touch_tests: state.signals.diff.touch_tests,
      touch_infra: state.signals.diff.touch_infra,
      touch_docs_only: state.signals.diff.touch_docs_only,
      estimated_diff_tokens: state.signals.diff.estimated_diff_tokens,
    };
  }
  return base;
}
