import type { JevProvider, JevProviderOptions, JevEvaluationState } from './types.js';
import { summarizeState, buildSelectionQuestions } from './questions.js';
import { normalizeSelection, unavailableDecision } from './normalize.js';
import type { NavigatorDecision } from '../schemas/navigator.js';

/**
 * Custom HTTPS endpoint that speaks the same evaluate contract as TypeSafe native.
 * Requires endpoint + model + API key secret.
 */
export function createCustomCompatibleProvider(options: JevProviderOptions): JevProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    id: 'custom-compatible',
    async evaluateModelSelection(state: JevEvaluationState): Promise<NavigatorDecision> {
      if (!options.apiKey) {
        return unavailableDecision('Custom Jev secret is required for custom-compatible');
      }
      if (!options.endpoint) {
        return unavailableDecision('jev_endpoint is required for custom-compatible');
      }
      if (!options.endpoint.startsWith('https://')) {
        return unavailableDecision('jev_endpoint must be HTTPS for custom-compatible');
      }
      if (!options.model) {
        return unavailableDecision('jev_model is required for custom-compatible');
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs);
        const response = await fetchImpl(options.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model: options.model,
            state: summarizeState(state),
            questions: buildSelectionQuestions(state.candidates),
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) {
          return unavailableDecision(
            `custom-compatible HTTP ${response.status}`.slice(0, 200),
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
              body.confidence?.selected_model ?? selected.confidence ?? 0.5,
            abstainProbability:
              body.answers?.abstain?.type === 'boolean'
                ? body.answers.abstain.probability
                : undefined,
            requestReviewProbability:
              body.answers?.request_review?.type === 'boolean'
                ? body.answers.request_review.probability
                : undefined,
            provisional: false,
            explanation: `Jev (custom-compatible) selected ${selected.choice}`,
          },
          state.candidates,
          state.signals.source,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('SCHEMA_REJECTED')) throw error;
        return unavailableDecision(`custom-compatible error: ${message}`);
      }
    },
  };
}
