import type { TaskSignals } from '../schemas/navigator.js';
import type { DiffSignals } from './diff-signals.js';
import { sanitizeTaskText } from '../utils/sanitize.js';

export type GithubEventKind = 'issue' | 'pull_request' | 'unknown';

export interface CollectedGithubTask {
  kind: GithubEventKind;
  number: number | null;
  title: string;
  body: string;
  task: string;
  signals: TaskSignals;
  htmlUrl: string | null;
}

function inferSignals(
  text: string,
  kind: GithubEventKind,
  diff?: DiffSignals,
): TaskSignals {
  const lower = text.toLowerCase();
  let needs_code =
    /\b(code|implement|bug|fix|refactor|typescript|python|api|pr)\b/.test(lower) ||
    kind === 'pull_request';
  let needs_reasoning =
    /\b(design|architect|trade-?off|why|plan|strategy|decide)\b/.test(lower);
  let needs_analysis =
    /\b(analy[sz]e|investigate|root cause|perf|security|audit)\b/.test(lower);

  if (diff) {
    if (diff.file_count > 0 && !diff.touch_docs_only) needs_code = true;
    if (diff.sensitive_paths.length > 0 || diff.touch_infra) {
      needs_analysis = true;
      needs_reasoning = true;
    }
    if (diff.file_count >= 25 || diff.additions + diff.deletions >= 800) {
      needs_reasoning = true;
    }
  }

  const baseTokens = Math.ceil(text.length / 4);
  const diffTokens = diff?.estimated_diff_tokens ?? 0;

  return {
    needs_reasoning,
    needs_code,
    needs_analysis,
    estimated_context_tokens: Math.min(48_000, baseTokens + diffTokens),
    latency_preference: needs_reasoning ? 'slow_ok' : 'balanced',
    source: kind === 'unknown' ? 'manual' : kind,
    diff,
  };
}

export function enrichWithDiff(
  collected: CollectedGithubTask,
  diff: DiffSignals,
): CollectedGithubTask {
  return {
    ...collected,
    signals: inferSignals(collected.task, collected.kind, diff),
  };
}

export function collectFromPayload(payload: Record<string, unknown>): CollectedGithubTask {
  const pr = payload.pull_request as Record<string, unknown> | undefined;
  const issue = payload.issue as Record<string, unknown> | undefined;

  if (pr && typeof pr === 'object') {
    const title = String(pr.title ?? '');
    const body = String(pr.body ?? '');
    const task = sanitizeTaskText(`${title}\n\n${body}`);
    return {
      kind: 'pull_request',
      number: typeof pr.number === 'number' ? pr.number : null,
      title,
      body,
      task,
      signals: inferSignals(task, 'pull_request'),
      htmlUrl: typeof pr.html_url === 'string' ? pr.html_url : null,
    };
  }

  if (issue && typeof issue === 'object') {
    if (issue.pull_request) {
      const title = String(issue.title ?? '');
      const body = String(issue.body ?? '');
      const task = sanitizeTaskText(`${title}\n\n${body}`);
      return {
        kind: 'pull_request',
        number: typeof issue.number === 'number' ? issue.number : null,
        title,
        body,
        task,
        signals: inferSignals(task, 'pull_request'),
        htmlUrl: typeof issue.html_url === 'string' ? issue.html_url : null,
      };
    }
    const title = String(issue.title ?? '');
    const body = String(issue.body ?? '');
    const task = sanitizeTaskText(`${title}\n\n${body}`);
    return {
      kind: 'issue',
      number: typeof issue.number === 'number' ? issue.number : null,
      title,
      body,
      task,
      signals: inferSignals(task, 'issue'),
      htmlUrl: typeof issue.html_url === 'string' ? issue.html_url : null,
    };
  }

  return {
    kind: 'unknown',
    number: null,
    title: '',
    body: '',
    task: '',
    signals: inferSignals('', 'unknown'),
    htmlUrl: null,
  };
}
