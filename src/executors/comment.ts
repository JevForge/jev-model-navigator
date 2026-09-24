import type { NavigatorDecision } from '../schemas/navigator.js';

export function buildCommentMarkdown(decision: NavigatorDecision): string {
  const lines = [
    '### JEV Model Navigator',
    '',
    `- **Decision:** \`${decision.decision}\``,
    `- **Selected model:** \`${decision.selected_model ?? 'none'}\``,
    `- **Alternate model:** \`${decision.alternate_model ?? 'none'}\``,
    `- **Ranked models:** ${(decision.ranked_models ?? []).map(m => `\`${m}\``).join(', ') || '`none`'}`,
    `- **Model provider:** \`${decision.provider ?? 'none'}\``,
    `- **Confidence:** ${decision.confidence.toFixed(3)}`,
    `- **Reason codes:** ${decision.reason_codes.map(c => `\`${c}\``).join(', ')}`,
    `- **Provisional:** ${decision.provisional ? 'yes' : 'no'}`,
  ];
  if (decision.explanation) {
    lines.push('', decision.explanation);
  }
  lines.push(
    '',
    '_Model provider above is the selected development/runtime model vendor, not the Jev access provider._',
  );
  return lines.join('\n');
}

export interface CommentClient {
  createComment(body: string): Promise<void>;
}

export async function maybePostComment(
  enabled: boolean,
  dryRun: boolean,
  decision: NavigatorDecision,
  client: CommentClient | null,
): Promise<'posted' | 'dry-run' | 'skipped'> {
  if (!enabled) return 'skipped';
  const body = buildCommentMarkdown(decision);
  if (dryRun || !client) return 'dry-run';
  await client.createComment(body);
  return 'posted';
}
