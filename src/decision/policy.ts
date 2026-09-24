import type { LowConfidencePolicy, ReasonCode } from '../schemas/enums.js';
import type { NavigatorDecision } from '../schemas/navigator.js';
import { NavigatorDecisionSchema } from '../schemas/navigator.js';

function mergeReasons(
  current: ReasonCode[],
  ...extra: ReasonCode[]
): ReasonCode[] {
  return [...new Set([...current, ...extra])];
}

export type PolicyOutcome =
  | { status: 'ok'; decision: NavigatorDecision }
  | { status: 'fail'; decision: NavigatorDecision; message: string }
  | { status: 'warn'; decision: NavigatorDecision; message: string }
  | { status: 'request-review'; decision: NavigatorDecision }
  | { status: 'no-op'; decision: NavigatorDecision; message: string };

export function enforceAllowlist(
  decision: NavigatorDecision,
  candidateIds: string[],
): NavigatorDecision {
  if (decision.decision !== 'SELECT_MODEL') {
    return NavigatorDecisionSchema.parse(decision);
  }
  if (!decision.selected_model || !candidateIds.includes(decision.selected_model)) {
    throw new Error('SCHEMA_REJECTED: selected_model outside allowlist');
  }
  return NavigatorDecisionSchema.parse(decision);
}

export function applyConfidencePolicy(
  decision: NavigatorDecision,
  minConfidence: number,
  policy: LowConfidencePolicy,
): PolicyOutcome {
  const validated = NavigatorDecisionSchema.parse(decision);

  if (validated.reason_codes.includes('JEV_UNAVAILABLE')) {
    if (policy === 'no-op') {
      return { status: 'no-op', decision: validated, message: validated.explanation };
    }
    if (policy === 'warn') {
      return { status: 'warn', decision: validated, message: validated.explanation };
    }
    if (policy === 'request-review') {
      return {
        status: 'request-review',
        decision: {
          ...validated,
          decision: 'REQUEST_REVIEW',
          selected_model: null,
          provider: null,
          reason_codes: ['JEV_UNAVAILABLE', 'POLICY_REQUEST_REVIEW'] as ReasonCode[],
        },
      };
    }
    return { status: 'fail', decision: validated, message: validated.explanation || 'JEV unavailable' };
  }

  if (validated.decision === 'ABSTAIN') {
    if (policy === 'no-op') return { status: 'no-op', decision: validated, message: 'Abstained' };
    if (policy === 'warn') return { status: 'warn', decision: validated, message: 'Abstained' };
    if (policy === 'request-review') {
      return {
        status: 'request-review',
        decision: {
          ...validated,
          decision: 'REQUEST_REVIEW',
          reason_codes: mergeReasons(validated.reason_codes, 'POLICY_REQUEST_REVIEW'),
        },
      };
    }
    return { status: 'fail', decision: validated, message: 'Navigator abstained' };
  }

  if (validated.decision === 'REQUEST_REVIEW') {
    return { status: 'request-review', decision: validated };
  }

  if (validated.confidence < minConfidence) {
    const low = {
      ...validated,
      decision: 'REQUEST_REVIEW' as const,
      selected_model: null,
      provider: null,
      reason_codes: mergeReasons(
        validated.reason_codes,
        'LOW_CONFIDENCE',
        'POLICY_REQUEST_REVIEW',
      ),
      explanation: `Confidence ${validated.confidence} below min_confidence ${minConfidence}`,
    };

    if (policy === 'fail') {
      return {
        status: 'fail',
        decision: NavigatorDecisionSchema.parse(low),
        message: low.explanation,
      };
    }
    if (policy === 'warn') {
      return {
        status: 'warn',
        decision: validated,
        message: low.explanation,
      };
    }
    if (policy === 'request-review') {
      return { status: 'request-review', decision: NavigatorDecisionSchema.parse(low) };
    }
    return { status: 'no-op', decision: validated, message: low.explanation };
  }

  return { status: 'ok', decision: validated };
}
