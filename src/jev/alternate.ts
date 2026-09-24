import type { ModelCandidate, NavigatorDecision } from '../schemas/navigator.js';
import type { JevEvaluationState } from './types.js';
import { buildAlternateQuestions } from './questions.js';
import { attachAlternate } from './normalize.js';

/**
 * After a primary SELECT_MODEL, ask Jev for a different fallback from the remaining allowlist.
 * Failures or empty remainders leave alternate_model null — never invent ids.
 */
export async function withAlternatePass(
  decision: NavigatorDecision,
  state: JevEvaluationState,
  askAlternate: (
    remaining: ModelCandidate[],
    primaryId: string,
  ) => Promise<string | null>,
): Promise<NavigatorDecision> {
  if (decision.decision !== 'SELECT_MODEL' || !decision.selected_model) {
    return attachAlternate(decision, null, state.candidates);
  }
  if (state.candidates.length < 2) {
    return attachAlternate(decision, null, state.candidates);
  }

  const { remaining } = buildAlternateQuestions(
    state.candidates,
    decision.selected_model,
  );
  if (remaining.length === 0) {
    return attachAlternate(decision, null, state.candidates);
  }

  try {
    const alternateId = await askAlternate(remaining, decision.selected_model);
    return attachAlternate(decision, alternateId, state.candidates);
  } catch {
    return attachAlternate(decision, null, state.candidates);
  }
}
