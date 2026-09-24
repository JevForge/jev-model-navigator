import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import {
  JEV_PROVIDERS,
  LOW_CONFIDENCE_POLICIES,
  BUDGET_PREFERENCES,
  type JevProviderId,
  type LowConfidencePolicy,
  type BudgetPreference,
} from '../schemas/enums.js';
import {
  ModelCandidateSchema,
  type ModelCandidate,
} from '../schemas/navigator.js';

const JeConfigSchema = z.object({
  jev_provider: z.enum(JEV_PROVIDERS).optional(),
  jev_endpoint: z.string().url().optional(),
  jev_model: z.string().min(1).optional(),
  min_confidence: z.number().min(0).max(1).optional(),
  low_confidence_policy: z.enum(LOW_CONFIDENCE_POLICIES).optional(),
  budget_preference: z.enum(BUDGET_PREFERENCES).optional(),
  decision_only: z.boolean().optional(),
  comment_on_github: z.boolean().optional(),
  model_catalog_path: z.string().optional(),
  candidates: z.array(ModelCandidateSchema).optional(),
});

export type JeConfig = z.infer<typeof JeConfigSchema>;

export function loadJeConfig(workspacePath: string, relativePath = '.jev/config.yml'): JeConfig {
  const full = resolve(workspacePath, relativePath);
  if (!existsSync(full)) return {};
  const raw = YAML.parse(readFileSync(full, 'utf8')) ?? {};
  return JeConfigSchema.parse(raw);
}

const CatalogFileSchema = z.object({
  candidates: z.array(ModelCandidateSchema).min(1).optional(),
  models: z.array(ModelCandidateSchema).min(1).optional(),
  providers: z
    .record(
      z.object({
        models: z
          .array(
            z.object({
              id: z.string(),
              display_name: z.string().optional(),
              api_model_id: z.string().optional(),
              availability: z.string().optional(),
              capabilities: z
                .array(z.enum(['reasoning', 'code', 'analysis', 'chat', 'vision']))
                .optional(),
              context_window: z.number().int().positive().optional(),
              cost_tier: z.enum(['free', 'low', 'medium', 'high']).optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

export function loadModelCatalog(workspacePath: string, relativePath: string): ModelCandidate[] {
  const full = resolve(workspacePath, relativePath);
  if (!existsSync(full)) {
    throw new Error(`Model catalog not found: ${relativePath}`);
  }
  const parsed = CatalogFileSchema.parse(YAML.parse(readFileSync(full, 'utf8')) ?? {});
  if (parsed.candidates?.length) return parsed.candidates;
  if (parsed.models?.length) return parsed.models;
  if (parsed.providers) {
    const fromProviders: ModelCandidate[] = [];
    for (const [provider, entry] of Object.entries(parsed.providers)) {
      for (const model of entry.models ?? []) {
        fromProviders.push(
          ModelCandidateSchema.parse({
            id: model.id,
            provider,
            display_name: model.display_name,
            api_model_id: model.api_model_id,
            availability: model.availability,
            capabilities: model.capabilities ?? [],
            context_window: model.context_window,
            cost_tier: model.cost_tier,
          }),
        );
      }
    }
    if (fromProviders.length) return fromProviders;
  }
  throw new Error(`Model catalog ${relativePath} has no candidates`);
}

export function parseCandidatesJson(raw: string): ModelCandidate[] {
  const data = JSON.parse(raw) as unknown;
  return z.array(ModelCandidateSchema).min(1).parse(data);
}

export function coalesceProvider(
  input?: string,
  config?: JeConfig,
): JevProviderId {
  const value = (input || config?.jev_provider || 'vercel-ai-gateway') as JevProviderId;
  if (!JEV_PROVIDERS.includes(value)) {
    throw new Error(`Unsupported jev_provider: ${value}`);
  }
  return value;
}

export function coalescePolicy(
  input?: string,
  config?: JeConfig,
): LowConfidencePolicy {
  return (input || config?.low_confidence_policy || 'fail') as LowConfidencePolicy;
}

export function coalesceBudget(
  input?: string,
  config?: JeConfig,
): BudgetPreference {
  return (input || config?.budget_preference || 'balanced') as BudgetPreference;
}
