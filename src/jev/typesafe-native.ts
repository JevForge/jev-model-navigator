import type { JevProvider, JevProviderOptions, JevEvaluationState } from './types.js';
import { summarizeState, buildSelectionQuestions } from './questions.js';
import { normalizeSelection, unavailableDecision } from './normalize.js';
import type { NavigatorDecision } from '../schemas/navigator.js';

/**
 * TypeSafe native adapter.
 * Calls a JSON evaluate endpoint compatible with typed Choice/Boolean answers.
 * Shape: POST { state, questions, model } → { answers, confidence? }
 */
export function createTypesafeNativeProvider(options: JevProviderOptions): JevProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint =
    options.endpoint ?? 'https://api.typesafe.ai/v1/evaluate';

  return {
    id: 'typesafe-native',
    async evaluateModelSelection(state: JevEvaluationState): Promise<NavigatorDecision> {
      if (!options.apiKey) {
        return unavailableDecision('TYPESAFE_API_KEY is required for typesafe-native');
      }
      try {
        const model = options.model;
        if (!model) {
          return unavailableDecision('jev_model is required for typesafe-native (pin a catalog model id)');
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs);
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model,
            state: summarizeState(state),
            questions: buildSelectionQuestions(state.candidates),
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) {
          return unavailableDecision(
            `typesafe-native HTTP ${response.status}: ${await response.text().catch(() => '')}`.slice(0, 500),
          );
        }

        const body = (await response.json()) as {
          answers?: Record<string, { type?: string; choice?: string; probability?: number; confidence?: number }>;
          confidence?: Record<string, number>;
        };

        const selected = body.answers?.selected_model;
        if (!selected || selected.type !== 'choice' || typeof selected.choice !== 'string') {
          throw new Error('SCHEMA_REJECTED: missing selected_model choice');
        }

        return normalizeSelection(
          {
            selectedModelId: selected.choice,
            confidence:
              body.confidence?.selected_model ??
              selected.confidence ??
              0.5,
            abstainProbability:
              body.answers?.abstain?.type === 'boolean'
                ? body.answers.abstain.probability
                : undefined,
            requestReviewProbability:
              body.answers?.request_review?.type === 'boolean'
                ? body.answers.request_review.probability
                : undefined,
            provisional: false,
            explanation: `Jev (typesafe-native/${model}) selected ${selected.choice}`,
          },
          state.candidates,
          state.signals.source,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('SCHEMA_REJECTED')) throw error;
        return unavailableDecision(`typesafe-native error: ${message}`);
      }
    },
  };
}
