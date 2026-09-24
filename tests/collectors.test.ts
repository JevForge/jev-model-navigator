import { describe, expect, it } from 'vitest';
import { sanitizeTaskText, redactSecrets } from '../src/utils/sanitize.js';
import { collectFromPayload } from '../src/collectors/github-event.js';

describe('sanitize', () => {
  it('redacts github tokens', () => {
    expect(redactSecrets('token ghp_abcdefghijklmnopqrstuvwxyz012345')).toContain('[REDACTED]');
  });

  it('truncates long task text', () => {
    const out = sanitizeTaskText('x'.repeat(10_000), 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out).toContain('truncated');
  });
});

describe('collectFromPayload', () => {
  it('collects an issue task', () => {
    const collected = collectFromPayload({
      issue: {
        number: 12,
        title: 'Implement login',
        body: 'Please implement OAuth login',
        html_url: 'https://github.com/org/repo/issues/12',
      },
    });
    expect(collected.kind).toBe('issue');
    expect(collected.task).toContain('Implement login');
    expect(collected.signals.source).toBe('issue');
    expect(collected.signals.needs_code).toBe(true);
  });

  it('collects a pull request task', () => {
    const collected = collectFromPayload({
      pull_request: {
        number: 3,
        title: 'Refactor auth',
        body: 'Analyze security trade-offs',
        html_url: 'https://github.com/org/repo/pull/3',
      },
    });
    expect(collected.kind).toBe('pull_request');
    expect(collected.signals.needs_analysis).toBe(true);
  });
});
