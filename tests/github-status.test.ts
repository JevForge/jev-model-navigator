import { describe, expect, it, vi } from 'vitest';
import {
  applyNavigatorLabels,
  buildCheckSummary,
  checkConclusion,
  desiredLabels,
  isManagedLabel,
  maybeCreateCheckRun,
  modelLabel,
} from '../src/executors/github-status.js';
import type { NavigatorDecision } from '../src/schemas/navigator.js';

const select: NavigatorDecision = {
  decision: 'SELECT_MODEL',
  selected_model: 'openai-gpt-5-5',
  provider: 'openai',
  confidence: 0.9,
  reason_codes: ['CANDIDATE_BEST_MATCH'],
  explanation: 'ok',
  provisional: false,
};

describe('github-status labels', () => {
  it('builds managed labels for SELECT_MODEL', () => {
    expect(desiredLabels(select)).toEqual([
      'jev:decision:SELECT_MODEL',
      'jev:model:openai-gpt-5-5',
    ]);
  });

  it('truncates long model labels to 50 chars', () => {
    const long = modelLabel('x'.repeat(80));
    expect(long.length).toBeLessThanOrEqual(50);
  });

  it('preserves unrelated labels while replacing managed ones', async () => {
    const setLabels = vi.fn(async () => undefined);
    const status = await applyNavigatorLabels(true, false, select, {
      listLabels: async () => ['bug', 'jev:model:old', 'jev:decision:ABSTAIN'],
      ensureLabel: async () => undefined,
      setLabels,
    });
    expect(status).toBe('applied');
    expect(setLabels).toHaveBeenCalledWith([
      'bug',
      'jev:decision:SELECT_MODEL',
      'jev:model:openai-gpt-5-5',
    ]);
    expect(isManagedLabel('bug')).toBe(false);
  });
});

describe('github-status check run', () => {
  it('maps policy outcomes to conclusions', () => {
    expect(checkConclusion({ status: 'ok', decision: select })).toBe('success');
    expect(
      checkConclusion({ status: 'fail', decision: select, message: 'x' }),
    ).toBe('failure');
    expect(checkConclusion({ status: 'request-review', decision: select })).toBe(
      'neutral',
    );
  });

  it('creates a check run when enabled', async () => {
    const createCheckRun = vi.fn(async () => undefined);
    const status = await maybeCreateCheckRun(
      true,
      false,
      'abc123',
      { status: 'ok', decision: select },
      { createCheckRun },
    );
    expect(status).toBe('created');
    expect(createCheckRun).toHaveBeenCalledOnce();
    expect(buildCheckSummary({ status: 'ok', decision: select })).toContain(
      'openai-gpt-5-5',
    );
  });

  it('skips without head sha', async () => {
    const status = await maybeCreateCheckRun(
      true,
      false,
      null,
      { status: 'ok', decision: select },
      { createCheckRun: async () => undefined },
    );
    expect(status).toBe('skipped');
  });
});
