import type { ModelCandidate, NavigatorDecision } from '../schemas/navigator.js';
import type { TaskSignals } from '../schemas/navigator.js';
import type { BudgetPreference, JevProviderId } from '../schemas/enums.js';

export interface JevEvaluationState {
  task: string;
  signals: TaskSignals;
  candidates: ModelCandidate[];
  budget_preference: BudgetPreference;
  constraints: {
    min_confidence: number;
    decision_only: boolean;
  };
  note: string;
}

export interface JevProvider {
  readonly id: JevProviderId;
  evaluateModelSelection(state: JevEvaluationState): Promise<NavigatorDecision>;
}

export interface JevProviderOptions {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}
