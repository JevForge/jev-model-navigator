import { REASON_CODES, type ReasonCode } from '../schemas/enums.js';
import {
  NavigatorDecisionSchema,
  type ModelCandidate,
  type NavigatorDecision,
} from '../schemas/navigator.js';

export interface RawJevSelection {
  selectedModelId: string | null;
  confidence: number;
  abstainProbability?: number;
  requestReviewProbability?: number;
  provisional?: boolean;
  explanation?: string;
}

function pickReasonCodes(
  candidate: ModelCandidate | undefined,
  source: 'issue' | 'pull_request' | 'manual',
  decision: NavigatorDecision['decision'],
): ReasonCode[] {
  const codes: ReasonCode[] = [];
  if (source === 'issue') codes.push('ISSUE_TASK');
  if (source === 'pull_request') codes.push('PULL_REQUEST_TASK');
  if (decision === 'ABSTAIN') codes.push('POLICY_ABSTAIN', 'NO_SAFE_CANDIDATE');
  if (decision === 'REQUEST_REVIEW') codes.push('POLICY_REQUEST_REVIEW', 'LOW_CONFIDENCE');
  if (decision === 'SELECT_MODEL' && candidate) {
    codes.push('CANDIDATE_BEST_MATCH');
    if (candidate.capabilities?.includes('reasoning')) codes.push('HIGH_REASONING_NEED');
    if (candidate.capabilities?.includes('code')) codes.push('CODE_GENERATION_FIT');
    if (candidate.capabilities?.includes('analysis')) codes.push('ANALYSIS_FIT');
    if (candidate.context_window && candidate.context_window >= 32_000) codes.push('CONTEXT_FIT');
    if (candidate.cost_tier === 'free' || candidate.cost_tier === 'low') codes.push('COST_OPTIMIZED');
    else codes.push('COST_ACCEPTABLE');
    if (candidate.availability) codes.push('AVAILABILITY_OK');
  }
  const unique = [...new Set(codes)].filter(c =>
    (REASON_CODES as readonly string[]).includes(c),
  ) as ReasonCode[];
  return unique.length ? unique.slice(0, 16) : ['NO_SAFE_CANDIDATE'];
}

export function normalizeSelection(
  raw: RawJevSelection,
  candidates: ModelCandidate[],
  source: 'issue' | 'pull_request' | 'manual',
): NavigatorDecision {
  const allow = new Set(candidates.map(c => c.id));
  let decision: NavigatorDecision['decision'] = 'SELECT_MODEL';
  let selected_model: string | null = raw.selectedModelId;
  let provider: string | null = null;

  if ((raw.abstainProbability ?? 0) >= 0.55) {
    decision = 'ABSTAIN';
    selected_model = null;
  } else if ((raw.requestReviewProbability ?? 0) >= 0.55 && (raw.confidence ?? 0) < 0.85) {
    decision = 'REQUEST_REVIEW';
    selected_model = null;
  }

  if (decision === 'SELECT_MODEL') {
    if (!selected_model || !allow.has(selected_model)) {
      throw new Error('SCHEMA_REJECTED: selected_model not in candidate allowlist');
    }
    const match = candidates.find(c => c.id === selected_model);
    provider = match?.provider ?? null;
  }

  const candidate = candidates.find(c => c.id === selected_model);
  const draft: NavigatorDecision = {
    decision,
    selected_model,
    provider,
    confidence: raw.confidence,
    reason_codes: pickReasonCodes(candidate, source, decision),
    explanation: raw.explanation ?? '',
    provisional: raw.provisional ?? false,
  };

  return NavigatorDecisionSchema.parse(draft);
}

export function unavailableDecision(message: string): NavigatorDecision {
  return NavigatorDecisionSchema.parse({
    decision: 'ABSTAIN',
    selected_model: null,
    provider: null,
    confidence: 0,
    reason_codes: ['JEV_UNAVAILABLE'],
    explanation: message,
    provisional: true,
  });
}
