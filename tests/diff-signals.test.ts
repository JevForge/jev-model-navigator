import { describe, expect, it } from 'vitest';
import { summarizeDiffFiles, toDiffFiles } from '../src/collectors/diff-signals.js';
import { enrichWithDiff, collectFromPayload } from '../src/collectors/github-event.js';
import { collectPullDiffSignals } from '../src/collectors/pull-diff.js';
import { summarizeState } from '../src/jev/questions.js';

describe('diff signals', () => {
  it('summarizes languages, sensitive paths, and docs-only', () => {
    const diff = summarizeDiffFiles(
      toDiffFiles([
        { filename: 'src/auth/login.ts', status: 'modified', additions: 40, deletions: 2 },
        { filename: 'tests/login.test.ts', status: 'added', additions: 20, deletions: 0 },
        { filename: 'README.md', status: 'modified', additions: 3, deletions: 1 },
      ]),
    );
    expect(diff.file_count).toBe(3);
    expect(diff.languages).toContain('typescript');
    expect(diff.touch_tests).toBe(true);
    expect(diff.sensitive_paths.some(p => p.includes('auth'))).toBe(true);
    expect(diff.touch_docs_only).toBe(false);
  });

  it('marks docs-only changes', () => {
    const diff = summarizeDiffFiles(
      toDiffFiles([{ filename: 'docs/guide.md', status: 'modified', additions: 10, deletions: 0 }]),
    );
    expect(diff.touch_docs_only).toBe(true);
    expect(diff.languages).toContain('markdown');
  });

  it('enriches PR task signals from diff', () => {
    const collected = collectFromPayload({
      pull_request: {
        number: 9,
        title: 'Update readme',
        body: 'docs only',
        html_url: 'https://example.com/pr/9',
      },
    });
    const diff = summarizeDiffFiles(
      toDiffFiles([
        { filename: 'infra/terraform/main.tf', status: 'modified', additions: 100, deletions: 20 },
      ]),
    );
    const enriched = enrichWithDiff(collected, diff);
    expect(enriched.signals.diff?.touch_infra).toBe(true);
    expect(enriched.signals.needs_analysis).toBe(true);
    expect(enriched.signals.needs_reasoning).toBe(true);
    expect(enriched.signals.estimated_context_tokens).toBeGreaterThan(collected.signals.estimated_context_tokens);
  });

  it('collectPullDiffSignals uses client without patch hunks', async () => {
    const diff = await collectPullDiffSignals(1, {
      async listFiles() {
        return [
          { filename: 'src/a.ts', status: 'modified', additions: 5, deletions: 1 },
          { filename: 'src/b.py', status: 'added', additions: 12, deletions: 0 },
        ];
      },
    });
    expect(diff.languages).toEqual(['python', 'typescript']);
    expect(diff.file_count).toBe(2);
  });

  it('includes diff block in summarized Jev state', () => {
    const diff = summarizeDiffFiles(
      toDiffFiles([{ filename: 'src/x.ts', status: 'modified', additions: 8, deletions: 1 }]),
    );
    const state = summarizeState({
      task: 'Ship feature',
      signals: {
        needs_reasoning: false,
        needs_code: true,
        needs_analysis: false,
        estimated_context_tokens: 100,
        latency_preference: 'balanced',
        source: 'pull_request',
        diff,
      },
      candidates: [{ id: 'm1', provider: 'openai', capabilities: ['code'] }],
      budget_preference: 'balanced',
      constraints: { min_confidence: 0.7, decision_only: true },
      note: 'test',
    });
    expect(state.diff?.file_count).toBe(1);
    expect(state.diff?.top_paths).toEqual(['src/x.ts']);
  });
});
