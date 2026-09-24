import { describe, expect, it } from 'vitest';
import { attachAlternate, normalizeSelection } from '../src/jev/normalize.js';
import { withAlternatePass } from '../src/jev/alternate.js';
import type { ModelCandidate } from '../src/schemas/navigator.js';

const candidates: ModelCandidate[] = [
  { id: 'openai-gpt-5-5', provider: 'openai', capabilities: ['code'] },
  { id: 'google-gemini-3-5-flash', provider: 'google', capabilities: ['code'] },
  { id: 'openrouter-north-mini-code', provider: 'openrouter', capabilities: ['code'] },
];

describe('alternate model ranking', () => {
  it('attaches a different alternate and ranked list', () => {
    const primary = normalizeSelection(
      { selectedModelId: 'openai-gpt-5-5', confidence: 0.9 },
      candidates,
      'issue',
    );
    const ranked = attachAlternate(primary, 'google-gemini-3-5-flash', candidates);
    expect(ranked.alternate_model).toBe('google-gemini-3-5-flash');
    expect(ranked.ranked_models).toEqual([
      'openai-gpt-5-5',
      'google-gemini-3-5-flash',
    ]);
  });

  it('rejects alternate equal to selected', () => {
    const primary = normalizeSelection(
      { selectedModelId: 'openai-gpt-5-5', confidence: 0.9 },
      candidates,
      'issue',
    );
    const ranked = attachAlternate(primary, 'openai-gpt-5-5', candidates);
    expect(ranked.alternate_model).toBeNull();
    expect(ranked.ranked_models).toEqual(['openai-gpt-5-5']);
  });

  it('withAlternatePass asks fallback when multiple candidates exist', async () => {
    const primary = normalizeSelection(
      { selectedModelId: 'openai-gpt-5-5', confidence: 0.91 },
      candidates,
      'pull_request',
    );
    const result = await withAlternatePass(
      primary,
      {
        task: 'refactor',
        signals: {
          needs_reasoning: false,
          needs_code: true,
          needs_analysis: false,
          estimated_context_tokens: 10,
          latency_preference: 'balanced',
          source: 'pull_request',
        },
        candidates,
        budget_preference: 'balanced',
        constraints: { min_confidence: 0.7, decision_only: true },
        note: 'test',
      },
      async remaining => remaining[0]?.id ?? null,
    );
    expect(result.alternate_model).toBe('google-gemini-3-5-flash');
    expect(result.ranked_models[0]).toBe('openai-gpt-5-5');
  });
});
