import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BatchCatalogSchema,
  BatchResponseSchema,
  type BatchResponse,
  type ModelCandidate,
} from '../schemas/navigator.js';
import type { DifficultyLevel, AudienceArea } from '../schemas/enums.js';
import type { JevProvider } from '../jev/types.js';

export function loadActionCatalog(path: string) {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  return BatchCatalogSchema.parse(raw);
}

function heuristicDifficulty(hint: DifficultyLevel | undefined, objective: string): DifficultyLevel {
  if (hint) return hint;
  const lower = objective.toLowerCase();
  if (/\b(monorepo|incident|rollback|rollout|security|cost)\b/.test(lower)) return 'VERY_HIGH';
  if (/\b(sbom|license|dependency|flaky|performance|accessib)\b/.test(lower)) return 'HIGH';
  if (/\b(classif|document|request)\b/.test(lower)) return 'LOW';
  return 'MEDIUM';
}

function heuristicAudience(hints: AudienceArea[]): AudienceArea[] {
  return hints.length ? hints : ['DEV', 'DEVOPS'];
}

/**
 * Offline/provisional planner used when no live Jev provider is wired.
 * Never invents model IDs: selected_model_id is null unless a candidate id is supplied and chosen.
 */
export function provisionalPlanAction(
  action: {
    id: string;
    repo: string;
    title: string;
    objective: string;
    mvp_difficulty_hint?: DifficultyLevel;
    audience_hints?: AudienceArea[];
  },
  candidates: ModelCandidate[],
): BatchResponse {
  const development_difficulty = heuristicDifficulty(
    action.mvp_difficulty_hint,
    action.objective,
  );
  const expected_public_use: DifficultyLevel =
    development_difficulty === 'LOW'
      ? 'MEDIUM'
      : development_difficulty === 'VERY_HIGH'
        ? 'HIGH'
        : development_difficulty;

  const preferredCaps =
    /security|incident|architect/.test(action.objective.toLowerCase())
      ? 'reasoning'
      : /test|flaky|ci/.test(action.objective.toLowerCase())
        ? 'code'
        : 'analysis';

  const match =
    candidates.find(c => c.capabilities?.includes(preferredCaps as 'reasoning' | 'code' | 'analysis')) ??
    candidates[0] ??
    null;

  return BatchResponseSchema.parse({
    action_id: action.id,
    repo: action.repo,
    selected_model_profile: match?.display_name ?? match?.id ?? null,
    selected_model_id: match?.id ?? null,
    development_difficulty,
    expected_public_use,
    rationale:
      match == null
        ? 'Provisional: no model catalog candidates available; difficulty/use are qualitative estimates only.'
        : `Provisional heuristic plan (Jev not invoked). Preferred capability=${preferredCaps}; picked allowlisted candidate ${match.id}.`,
    audience: heuristicAudience(action.audience_hints ?? []),
    confidence: match ? 0.35 : 0.1,
    provisional: true,
    evaluated_at: new Date().toISOString(),
  });
}

export async function planActionsWithJev(
  catalogPath: string,
  responsesDir: string,
  candidates: ModelCandidate[],
  provider: JevProvider | null,
): Promise<BatchResponse[]> {
  const catalog = loadActionCatalog(catalogPath);
  mkdirSync(responsesDir, { recursive: true });
  const results: BatchResponse[] = [];

  for (const action of catalog.actions) {
    let response: BatchResponse;
    if (!provider || candidates.length === 0) {
      response = provisionalPlanAction(action, candidates);
    } else {
      try {
        const decision = await provider.evaluateModelSelection({
          task: `${action.title}\n\n${action.objective}`,
          signals: {
            needs_reasoning: true,
            needs_code: true,
            needs_analysis: true,
            estimated_context_tokens: 4000,
            latency_preference: 'slow_ok',
            source: 'manual',
          },
          candidates,
          budget_preference: 'balanced',
          constraints: { min_confidence: 0.5, decision_only: true },
          note: 'Organizational planning for a GitHub Action. Qualitative only.',
        });
        response = BatchResponseSchema.parse({
          action_id: action.id,
          repo: action.repo,
          selected_model_profile:
            candidates.find(c => c.id === decision.selected_model)?.display_name ??
            decision.selected_model,
          selected_model_id: decision.selected_model,
          development_difficulty: action.mvp_difficulty_hint ?? 'MEDIUM',
          expected_public_use: 'MEDIUM',
          rationale: decision.explanation || decision.reason_codes.join(', '),
          audience: heuristicAudience(action.audience_hints ?? []),
          confidence: decision.confidence,
          provisional: decision.provisional,
          evaluated_at: new Date().toISOString(),
        });
      } catch {
        response = provisionalPlanAction(action, candidates);
      }
    }

    const outPath = resolve(responsesDir, `${action.id}.json`);
    writeFileSync(outPath, `${JSON.stringify(response, null, 2)}\n`, 'utf8');
    results.push(response);
  }

  return results;
}

export function ensureDir(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}