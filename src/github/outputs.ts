import type { NavigatorDecision } from '../schemas/navigator.js';
import type { PolicyOutcome } from '../decision/policy.js';

export interface ActionOutputWriter {
  setOutput(name: string, value: string): void;
  setFailed(message: string): void;
  warning(message: string): void;
  info(message: string): void;
}

export function writeDecisionOutputs(
  writer: ActionOutputWriter,
  decision: NavigatorDecision,
  summary: string,
): void {
  writer.setOutput('selected_model', decision.selected_model ?? '');
  writer.setOutput('provider', decision.provider ?? '');
  writer.setOutput('alternate_model', decision.alternate_model ?? '');
  writer.setOutput('ranked_models', JSON.stringify(decision.ranked_models ?? []));
  writer.setOutput('confidence', String(decision.confidence));
  writer.setOutput('reason_codes', JSON.stringify(decision.reason_codes));
  writer.setOutput('decision', decision.decision);
  writer.setOutput('explanation', decision.explanation);
  writer.setOutput('provisional', String(decision.provisional));
  writer.setOutput('summary', summary);
}

export function applyPolicyToAction(
  writer: ActionOutputWriter,
  outcome: PolicyOutcome,
  summary: string,
): void {
  writeDecisionOutputs(writer, outcome.decision, summary);
  if (outcome.status === 'fail') {
    writer.setFailed(outcome.message);
    return;
  }
  if (outcome.status === 'warn') {
    writer.warning(outcome.message);
  }
  if (outcome.status === 'request-review') {
    writer.warning('Model selection requires human review');
  }
  if (outcome.status === 'no-op') {
    writer.info(outcome.message);
  }
}
