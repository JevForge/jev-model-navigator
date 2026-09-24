import { describe, expect, it } from 'vitest';
import {
  NavigatorDecisionSchema,
  ModelCandidateSchema,
} from '../src/schemas/navigator.js';

describe('NavigatorDecisionSchema', () => {
  it('accepts a valid SELECT_MODEL decision', () => {
    const parsed = NavigatorDecisionSchema.parse({
      decision: 'SELECT_MODEL',
      selected_model: 'openai-gpt-5-5',
      provider: 'openai',
      confidence: 0.86,
      reason_codes: ['CANDIDATE_BEST_MATCH', 'CODE_GENERATION_FIT'],
      explanation: 'Best code fit',
      provisional: false,
    });
    expect(parsed.selected_model).toBe('openai-gpt-5-5');
  });

  it('rejects SELECT_MODEL without selected_model', () => {
    expect(() =>
      NavigatorDecisionSchema.parse({
        decision: 'SELECT_MODEL',
        selected_model: null,
        provider: 'openai',
        confidence: 0.9,
        reason_codes: ['CANDIDATE_BEST_MATCH'],
      }),
    ).toThrow();
  });

  it('rejects unknown reason codes', () => {
    expect(() =>
      NavigatorDecisionSchema.parse({
        decision: 'ABSTAIN',
        selected_model: null,
        provider: null,
        confidence: 0,
        reason_codes: ['rm -rf /'],
      }),
    ).toThrow();
  });

  it('rejects confidence outside 0..1', () => {
    expect(() =>
      NavigatorDecisionSchema.parse({
        decision: 'ABSTAIN',
        selected_model: null,
        provider: null,
        confidence: 1.5,
        reason_codes: ['NO_SAFE_CANDIDATE'],
      }),
    ).toThrow();
  });

  it('rejects ABSTAIN with a selected_model set', () => {
    expect(() =>
      NavigatorDecisionSchema.parse({
        decision: 'ABSTAIN',
        selected_model: 'openai-gpt-5-5',
        provider: 'openai',
        confidence: 0.2,
        reason_codes: ['POLICY_ABSTAIN'],
      }),
    ).toThrow();
  });
});

describe('ModelCandidateSchema', () => {
  it('parses a candidate', () => {
    const c = ModelCandidateSchema.parse({
      id: 'google-gemini-3-5-flash',
      provider: 'google',
      capabilities: ['code'],
    });
    expect(c.id).toBe('google-gemini-3-5-flash');
  });
});
