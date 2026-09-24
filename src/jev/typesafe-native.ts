import type { JevProvider, JevProviderOptions, JevEvaluationState } from './types.js';
import {
  summarizeState,
  buildSelectionQuestions,
  buildAlternateQuestions,
} from './questions.js';
import { normalizeSelection, unavailableDecision } from './normalize.js';
import { withAlternatePass } from './alternate.js';
import type { NavigatorDecision } from '../schemas/navigator.js';

type EvaluateBody = {
  answers?: Record<
    string,
    { type?: string; choice?: string; probability?: number; confidence?: number }
  >;
  confidence?: Record<string, number>;
};

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

        const post = async (payload: unknown): Promise<EvaluateBody> => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), options.timeoutMs);
          const response = await fetchImpl(endpoint, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${options.apiKey}`,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (!response.ok) {
            throw new Error(
              `typesafe-native HTTP ${response.status}: ${await response.text().catch(() => '')}`.slice(0, 500),
            );
          }
          return (await response.json()) as EvaluateBody;
        };

        const body = await post({
          model,
          state: summarizeState(state),
          questions: buildSelectionQuestions(state.candidates),
        });

        const selected = body.answers?.selected_model;
        if (!selected || selected.type !== 'choice' || typeof selected.choice !== 'string') {
          throw new Error('SCHEMA_REJECTED: missing selected_model choice');
        }

        const primary = normalizeSelection(
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

        return withAlternatePass(primary, state, async (remaining, primaryId) => {
          const { questions } = buildAlternateQuestions(
            [...remaining, ...state.candidates.filter(c => c.id === primaryId)],
            primaryId,
          );
          const second = await post({
            model,
            state: { ...summarizeState(state), recommendedModel: primaryId },
            questions,
          });
          const alt = second.answers?.alternate_model;
          if (!alt || alt.type !== 'choice' || typeof alt.choice !== 'string') return null;
          return alt.choice;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('SCHEMA_REJECTED')) throw error;
        if (message.startsWith('typesafe-native HTTP')) {
          return unavailableDecision(message);
        }
        return unavailableDecision(`typesafe-native error: ${message}`);
      }
    },
  };
}
