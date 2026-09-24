export const REASON_CODES = [
  'HIGH_REASONING_NEED',
  'CODE_GENERATION_FIT',
  'ANALYSIS_FIT',
  'CONTEXT_FIT',
  'SPEED_PREFERENCE',
  'COST_ACCEPTABLE',
  'COST_OPTIMIZED',
  'AVAILABILITY_OK',
  'CANDIDATE_BEST_MATCH',
  'LOW_CONFIDENCE',
  'NO_SAFE_CANDIDATE',
  'JEV_UNAVAILABLE',
  'SCHEMA_REJECTED',
  'POLICY_ABSTAIN',
  'POLICY_REQUEST_REVIEW',
  'ISSUE_TASK',
  'PULL_REQUEST_TASK',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export const DECISIONS = ['SELECT_MODEL', 'ABSTAIN', 'REQUEST_REVIEW'] as const;
export type Decision = (typeof DECISIONS)[number];

export const JEV_PROVIDERS = [
  'vercel-ai-gateway',
  'typesafe-native',
  'custom-compatible',
] as const;
export type JevProviderId = (typeof JEV_PROVIDERS)[number];

export const LOW_CONFIDENCE_POLICIES = [
  'fail',
  'warn',
  'request-review',
  'no-op',
] as const;
export type LowConfidencePolicy = (typeof LOW_CONFIDENCE_POLICIES)[number];

export const BUDGET_PREFERENCES = [
  'cheapest',
  'balanced',
  'best_quality',
] as const;
export type BudgetPreference = (typeof BUDGET_PREFERENCES)[number];

export const DIFFICULTY_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export const AUDIENCE_AREAS = [
  'DEV',
  'DEVOPS',
  'DEVSECOPS',
  'QA',
  'FINOPS',
  'SRE',
  'SUPPORT',
  'PRODUCT',
] as const;
export type AudienceArea = (typeof AUDIENCE_AREAS)[number];
