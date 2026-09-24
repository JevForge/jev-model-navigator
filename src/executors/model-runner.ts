import type { NavigatorDecision } from '../schemas/navigator.js';

/**
 * Future model execution seam. The Action never treats Jev prose as a command.
 * Downstream runners must only accept allowlisted model ids from a SELECT_MODEL decision.
 */
export interface ModelRunner {
  readonly id: string;
  invoke(modelId: string, task: string): Promise<{ ok: boolean; detail: string }>;
}

export class NoopModelRunner implements ModelRunner {
  readonly id = 'noop';
  async invoke(modelId: string, task: string) {
    return {
      ok: true,
      detail: `decision_only: skipped invoke for ${modelId} (${task.slice(0, 40)}…)`,
    };
  }
}

export async function maybeInvokeSelectedModel(
  decision: NavigatorDecision,
  decisionOnly: boolean,
  runner: ModelRunner,
  task: string,
): Promise<string | null> {
  if (decisionOnly) return null;
  if (decision.decision !== 'SELECT_MODEL' || !decision.selected_model) {
    return 'invoke skipped: no selected model';
  }
  const result = await runner.invoke(decision.selected_model, task);
  return result.detail;
}
