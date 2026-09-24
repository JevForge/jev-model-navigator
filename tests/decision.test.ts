import { describe, expect, it } from 'vitest';
import { normalizeSelection } from '../src/jev/normalize.js';
import { applyConfidencePolicy, enforceAllowlist } from '../src/decision/policy.js';
import type { ModelCandidate } from '../src/schemas/navigator.js';

const candidates: ModelCandidate[] = [
  {
    id: 'openai-gpt-5-5',
    provider: 'openai',
    capabilities: ['reasoning', 'code'],
    context_window: 200000,
    cost_tier: 'high',
  },
  {
    id: 'google-gemini-3-5-flash',
    provider: 'google',
    capabilities: ['code'],
    cost_tier: 'low',
  },
];

describe('normalizeSelection', () => {
  it('maps a valid choice onto SELECT_MODEL', () => {
    const decision = normalizeSelection(
      { selectedModelId: 'openai-gpt-5-5', confidence: 0.9 },
      candidates,
      'issue',
    );
    expect(decision.decision).toBe('SELECT_MODEL');
    expect(decision.provider).toBe('openai');
    expect(decision.reason_codes).toContain('ISSUE_TASK');
  });

  it('rejects models outside the allowlist', () => {
    expect(() =>
      normalizeSelection(
        { selectedModelId: 'not-in-list', confidence: 0.9 },
        candidates,
        'issue',
      ),
    ).toThrow(/SCHEMA_REJECTED/);
  });

  it('abstains when abstain probability is high', () => {
    const decision = normalizeSelection(
      {
        selectedModelId: 'openai-gpt-5-5',
        confidence: 0.4,
        abstainProbability: 0.8,
      },
      candidates,
      'pull_request',
    );
    expect(decision.decision).toBe('ABSTAIN');
    expect(decision.selected_model).toBeNull();
  });
});

describe('policy', () => {
  it('fails when confidence is below minimum and policy is fail', () => {
    const decision = normalizeSelection(
      { selectedModelId: 'openai-gpt-5-5', confidence: 0.2 },
      candidates,
      'issue',
    );
    const outcome = applyConfidencePolicy(decision, 0.7, 'fail');
    expect(outcome.status).toBe('fail');
  });

  it('enforceAllowlist rejects foreign models', () => {
    expect(() =>
      enforceAllowlist(
        {
          decision: 'SELECT_MODEL',
          selected_model: 'evil-model',
          provider: 'x',
          confidence: 0.99,
          reason_codes: ['CANDIDATE_BEST_MATCH'],
          explanation: '',
          provisional: false,
        },
        candidates.map(c => c.id),
      ),
    ).toThrow(/SCHEMA_REJECTED/);
  });
});
