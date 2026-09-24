import { createGateway, experimental_evaluate as evaluate } from 'ai';
import type { JevProvider, JevProviderOptions, JevEvaluationState } from './types.js';
import {
  buildAlternateQuestions,
  buildSelectionQuestions,
  summarizeState,
} from './questions.js';
import { normalizeSelection, unavailableDecision } from './normalize.js';
import { withAlternatePass } from './alternate.js';
import type { NavigatorDecision } from '../schemas/navigator.js';

function confidenceFromAnswer(answer: {
  type?: string;
  confidence?: number;
  probability?: number;
}): number {
  if (typeof answer.confidence === 'number' && Number.isFinite(answer.confidence)) {
    return Math.min(1, Math.max(0, answer.confidence));
  }
  if (typeof answer.probability === 'number' && Number.isFinite(answer.probability)) {
    return Math.min(1, Math.max(0, answer.probability));
  }
  return 0.5;
}

export function createVercelAiGatewayProvider(options: JevProviderOptions): JevProvider {
  return {
    id: 'vercel-ai-gateway',
    async evaluateModelSelection(state: JevEvaluationState): Promise<NavigatorDecision> {
      if (!options.apiKey) {
        return unavailableDecision('AI_GATEWAY_API_KEY is required for vercel-ai-gateway');
      }
      try {
        const gateway = createGateway({ apiKey: options.apiKey });
        const model = gateway.evaluationModel(options.model ?? 'typesafe-ai/jev');
        const questions = buildSelectionQuestions(state.candidates);
        const result = await evaluate({
          model,
          state: JSON.stringify(summarizeState(state)),
          questions,
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(options.timeoutMs),
          providerOptions: {
            gateway: { zeroDataRetention: true },
          },
        });

        const selected = result.answers.selected_model;
        if (!selected || selected.type !== 'choice' || typeof selected.choice !== 'string') {
          throw new Error('SCHEMA_REJECTED: missing selected_model choice');
        }

        const abstain = result.answers.abstain;
        const review = result.answers.request_review;
        const typesafeConfidence = (
          result as {
            providerMetadata?: { typesafe?: { confidence?: Record<string, number> } };
          }
        ).providerMetadata?.typesafe?.confidence?.selected_model;

        const primary = normalizeSelection(
          {
            selectedModelId: selected.choice,
            confidence:
              typeof typesafeConfidence === 'number'
                ? typesafeConfidence
                : confidenceFromAnswer(selected as { confidence?: number }),
            abstainProbability:
              abstain?.type === 'boolean' ? abstain.probability : undefined,
            requestReviewProbability:
              review?.type === 'boolean' ? review.probability : undefined,
            provisional: false,
            explanation: `Jev (vercel-ai-gateway) selected ${selected.choice}`,
          },
          state.candidates,
          state.signals.source,
        );

        return withAlternatePass(primary, state, async (remaining, primaryId) => {
          const { questions: altQuestions } = buildAlternateQuestions(
            [...remaining, ...state.candidates.filter(c => c.id === primaryId)],
            primaryId,
          );
          const second = await evaluate({
            model,
            state: JSON.stringify({
              ...summarizeState(state),
              recommendedModel: primaryId,
            }),
            questions: altQuestions,
            maxRetries: 1,
            abortSignal: AbortSignal.timeout(options.timeoutMs),
            providerOptions: {
              gateway: { zeroDataRetention: true },
            },
          });
          const alt = second.answers.alternate_model;
          if (!alt || alt.type !== 'choice' || typeof alt.choice !== 'string') return null;
          return alt.choice;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('SCHEMA_REJECTED')) throw error;
        return unavailableDecision(`vercel-ai-gateway error: ${message}`);
      }
    },
  };
}
