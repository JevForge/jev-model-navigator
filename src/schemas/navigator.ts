import { z } from 'zod';
import {
  AUDIENCE_AREAS,
  BUDGET_PREFERENCES,
  DECISIONS,
  DIFFICULTY_LEVELS,
  JEV_PROVIDERS,
  LOW_CONFIDENCE_POLICIES,
  REASON_CODES,
} from './enums.js';
import { DiffSignalsSchema } from '../collectors/diff-signals.js';

export const ModelCandidateSchema = z.object({
  id: z.string().min(1).max(128),
  provider: z.string().min(1).max(64),
  display_name: z.string().min(1).max(128).optional(),
  api_model_id: z.string().min(1).max(256).optional(),
  capabilities: z
    .array(z.enum(['reasoning', 'code', 'analysis', 'chat', 'vision']))
    .default([]),
  context_window: z.number().int().positive().optional(),
  cost_tier: z.enum(['free', 'low', 'medium', 'high']).optional(),
  availability: z.string().min(1).max(64).optional(),
});

export type ModelCandidate = z.infer<typeof ModelCandidateSchema>;

export const TaskSignalsSchema = z.object({
  needs_reasoning: z.boolean().default(false),
  needs_code: z.boolean().default(false),
  needs_analysis: z.boolean().default(false),
  estimated_context_tokens: z.number().int().nonnegative().default(0),
  latency_preference: z.enum(['fast', 'balanced', 'slow_ok']).default('balanced'),
  source: z.enum(['issue', 'pull_request', 'manual']).default('manual'),
  diff: DiffSignalsSchema.optional(),
});

export type TaskSignals = z.infer<typeof TaskSignalsSchema>;

export const NavigatorInputsSchema = z.object({
  task: z.string().min(1).max(12_000),
  candidates: z.array(ModelCandidateSchema).min(1).max(64),
  min_confidence: z.number().min(0).max(1).default(0.7),
  decision_only: z.boolean().default(true),
  low_confidence_policy: z.enum(LOW_CONFIDENCE_POLICIES).default('fail'),
  jev_provider: z.enum(JEV_PROVIDERS).default('vercel-ai-gateway'),
  budget_preference: z.enum(BUDGET_PREFERENCES).default('balanced'),
  jev_endpoint: z.string().url().optional(),
  jev_model: z.string().min(1).optional(),
  timeout_ms: z.number().int().positive().max(120_000).default(45_000),
  comment_on_github: z.boolean().default(false),
  dry_run: z.boolean().default(false),
});

export type NavigatorInputs = z.infer<typeof NavigatorInputsSchema>;

export const NavigatorDecisionSchema = z
  .object({
    decision: z.enum(DECISIONS),
    selected_model: z.string().nullable(),
    provider: z.string().nullable(),
    alternate_model: z.string().nullable().default(null),
    ranked_models: z.array(z.string()).max(8).default([]),
    confidence: z.number().min(0).max(1),
    reason_codes: z.array(z.enum(REASON_CODES)).min(1).max(16),
    explanation: z.string().max(2_000).default(''),
    provisional: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'SELECT_MODEL') {
      if (!value.selected_model) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SELECT_MODEL requires selected_model',
          path: ['selected_model'],
        });
      }
      if (!value.provider) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SELECT_MODEL requires provider',
          path: ['provider'],
        });
      }
    }
    if (value.decision !== 'SELECT_MODEL' && value.selected_model) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Non-SELECT decisions must not set selected_model',
        path: ['selected_model'],
      });
    }
    if (
      value.alternate_model &&
      value.selected_model &&
      value.alternate_model === value.selected_model
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'alternate_model must differ from selected_model',
        path: ['alternate_model'],
      });
    }
  });

export type NavigatorDecision = z.infer<typeof NavigatorDecisionSchema>;

export const BatchActionSchema = z.object({
  id: z.string().min(1),
  repo: z.string().min(1),
  title: z.string().min(1),
  objective: z.string().min(1),
  mvp_difficulty_hint: z.enum(DIFFICULTY_LEVELS).optional(),
  audience_hints: z.array(z.enum(AUDIENCE_AREAS)).default([]),
});

export const BatchCatalogSchema = z.object({
  version: z.number().int().positive(),
  actions: z.array(BatchActionSchema).min(1),
});

export const BatchResponseSchema = z.object({
  action_id: z.string(),
  repo: z.string(),
  selected_model_profile: z.string().nullable(),
  selected_model_id: z.string().nullable(),
  development_difficulty: z.enum(DIFFICULTY_LEVELS),
  expected_public_use: z.enum(DIFFICULTY_LEVELS),
  rationale: z.string().min(1).max(4_000),
  audience: z.array(z.enum(AUDIENCE_AREAS)).min(1),
  confidence: z.number().min(0).max(1),
  provisional: z.boolean(),
  evaluated_at: z.string(),
});

export type BatchResponse = z.infer<typeof BatchResponseSchema>;
