import { describe, expect, it, vi } from 'vitest';
import { createTypesafeNativeProvider } from '../src/jev/typesafe-native.js';
import { createCustomCompatibleProvider } from '../src/jev/custom-compatible.js';
import { createJevProvider } from '../src/jev/factory.js';
import { runNavigator } from '../src/run.js';
import type { ModelCandidate } from '../src/schemas/navigator.js';

const candidates: ModelCandidate[] = [
  {
    id: 'openai-gpt-5-5',
    provider: 'openai',
    capabilities: ['reasoning', 'code'],
  },
  {
    id: 'google-gemini-3-5-flash',
    provider: 'google',
    capabilities: ['code'],
  },
];

const stateBase = {
  task: 'Fix flaky auth test',
  signals: {
    needs_reasoning: false,
    needs_code: true,
    needs_analysis: false,
    estimated_context_tokens: 1000,
    latency_preference: 'balanced' as const,
    source: 'issue' as const,
  },
  candidates,
  budget_preference: 'balanced' as const,
  constraints: { min_confidence: 0.7, decision_only: true },
  note: 'test',
};

describe('typesafe-native provider', () => {
  it('normalizes a compatible evaluate response', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          answers: {
            selected_model: { type: 'choice', choice: 'openai-gpt-5-5', confidence: 0.91 },
            abstain: { type: 'boolean', probability: 0.1 },
            request_review: { type: 'boolean', probability: 0.05 },
          },
        }),
        { status: 200 },
      ),
    );

    const provider = createTypesafeNativeProvider({
      apiKey: 'test-key',
      model: 'jev-1.0.0',
      timeoutMs: 5000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const decision = await provider.evaluateModelSelection(stateBase);
    expect(decision.decision).toBe('SELECT_MODEL');
    expect(decision.selected_model).toBe('openai-gpt-5-5');
    expect(decision.provisional).toBe(false);
  });

  it('returns provisional ABSTAIN when key missing', async () => {
    const provider = createTypesafeNativeProvider({ timeoutMs: 1000 });
    const decision = await provider.evaluateModelSelection(stateBase);
    expect(decision.reason_codes).toContain('JEV_UNAVAILABLE');
    expect(decision.provisional).toBe(true);
  });
});

describe('custom-compatible provider', () => {
  it('requires https endpoint', async () => {
    const provider = createCustomCompatibleProvider({
      apiKey: 'x',
      model: 'jev',
      endpoint: 'http://insecure.example/evaluate',
      timeoutMs: 1000,
    });
    const decision = await provider.evaluateModelSelection(stateBase);
    expect(decision.explanation).toMatch(/HTTPS/i);
  });
});

describe('factory', () => {
  it('does not silently change provider id', () => {
    const provider = createJevProvider({
      provider: 'custom-compatible',
      timeoutMs: 1000,
    });
    expect(provider.id).toBe('custom-compatible');
  });
});

describe('runNavigator integration', () => {
  it('writes SELECT_MODEL through mocked native provider', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          answers: {
            selected_model: {
              type: 'choice',
              choice: 'google-gemini-3-5-flash',
              confidence: 0.88,
            },
            abstain: { type: 'boolean', probability: 0.01 },
            request_review: { type: 'boolean', probability: 0.01 },
          },
        }),
        { status: 200 },
      ),
    );

    const result = await runNavigator({
      task: 'Implement caching layer',
      signals: stateBase.signals,
      candidates,
      min_confidence: 0.7,
      decision_only: true,
      low_confidence_policy: 'fail',
      jev_provider: 'typesafe-native',
      budget_preference: 'balanced',
      jev_model: 'jev-1.0.0',
      jev_endpoint: 'https://example.test/v1/evaluate',
      timeout_ms: 5000,
      comment_on_github: false,
      dry_run: true,
      apiKey: 'test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.outcome.status).toBe('ok');
    expect(result.decision.selected_model).toBe('google-gemini-3-5-flash');
    expect(result.decision.provider).toBe('google');
  });
});
