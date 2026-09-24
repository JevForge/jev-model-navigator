import type { NavigatorDecision } from '../schemas/navigator.js';
import type { PolicyOutcome } from '../decision/policy.js';

export const MODEL_LABEL_PREFIX = 'jev:model:';
export const DECISION_LABEL_PREFIX = 'jev:decision:';
export const REVIEW_LABEL = 'jev:review';

/** GitHub labels are max 50 chars; keep ids stable and truncated when needed. */
export function modelLabel(modelId: string): string {
  const raw = `${MODEL_LABEL_PREFIX}${modelId}`;
  return raw.length <= 50 ? raw : `${raw.slice(0, 47)}...`;
}

export function decisionLabel(decision: NavigatorDecision['decision']): string {
  return `${DECISION_LABEL_PREFIX}${decision}`;
}

export function desiredLabels(decision: NavigatorDecision): string[] {
  const labels = [decisionLabel(decision.decision)];
  if (decision.selected_model) labels.push(modelLabel(decision.selected_model));
  if (decision.decision === 'REQUEST_REVIEW') labels.push(REVIEW_LABEL);
  return labels;
}

export function isManagedLabel(name: string): boolean {
  return (
    name.startsWith(MODEL_LABEL_PREFIX) ||
    name.startsWith(DECISION_LABEL_PREFIX) ||
    name === REVIEW_LABEL
  );
}

export interface LabelClient {
  listLabels(): Promise<string[]>;
  ensureLabel(name: string): Promise<void>;
  setLabels(next: string[]): Promise<void>;
}

/**
 * Replace managed `jev:*` labels while preserving unrelated labels on the Issue/PR.
 */
export async function applyNavigatorLabels(
  enabled: boolean,
  dryRun: boolean,
  decision: NavigatorDecision,
  client: LabelClient | null,
): Promise<'applied' | 'dry-run' | 'skipped'> {
  if (!enabled) return 'skipped';
  if (dryRun || !client) return 'dry-run';

  const current = await client.listLabels();
  const preserved = current.filter(name => !isManagedLabel(name));
  const next = [...new Set([...preserved, ...desiredLabels(decision)])];

  for (const name of desiredLabels(decision)) {
    await client.ensureLabel(name);
  }
  await client.setLabels(next);
  return 'applied';
}

export function checkConclusion(
  outcome: PolicyOutcome,
): 'success' | 'neutral' | 'failure' {
  if (outcome.status === 'ok') return 'success';
  if (outcome.status === 'fail') return 'failure';
  return 'neutral';
}

export function buildCheckSummary(outcome: PolicyOutcome): string {
  const d = outcome.decision;
  return [
    `### JEV Model Navigator`,
    '',
    `| Field | Value |`,
    `| --- | --- |`,
    `| Decision | \`${d.decision}\` |`,
    `| Selected model | \`${d.selected_model ?? 'none'}\` |`,
    `| Alternate model | \`${d.alternate_model ?? 'none'}\` |`,
    `| Ranked models | ${(d.ranked_models ?? []).map(m => `\`${m}\``).join(', ') || '`none`'} |`,
    `| Model provider | \`${d.provider ?? 'none'}\` |`,
    `| Confidence | ${d.confidence.toFixed(3)} |`,
    `| Policy | \`${outcome.status}\` |`,
    `| Reason codes | ${d.reason_codes.map(c => `\`${c}\``).join(', ')} |`,
    '',
    d.explanation || '_No explanation._',
  ].join('\n');
}

export interface CheckRunClient {
  createCheckRun(input: {
    name: string;
    headSha: string;
    conclusion: 'success' | 'neutral' | 'failure';
    title: string;
    summary: string;
  }): Promise<void>;
}

export async function maybeCreateCheckRun(
  enabled: boolean,
  dryRun: boolean,
  headSha: string | null,
  outcome: PolicyOutcome,
  client: CheckRunClient | null,
): Promise<'created' | 'dry-run' | 'skipped'> {
  if (!enabled) return 'skipped';
  if (!headSha) return 'skipped';
  if (dryRun || !client) return 'dry-run';

  const conclusion = checkConclusion(outcome);
  const title =
    outcome.decision.selected_model != null
      ? `${outcome.decision.decision}: ${outcome.decision.selected_model}`
      : outcome.decision.decision;

  await client.createCheckRun({
    name: 'JEV Model Navigator',
    headSha,
    conclusion,
    title,
    summary: buildCheckSummary(outcome),
  });
  return 'created';
}
