import * as core from '@actions/core';
import * as github from '@actions/github';
import { collectFromPayload } from './collectors/github-event.js';
import {
  coalesceBudget,
  coalescePolicy,
  coalesceProvider,
  loadJeConfig,
  loadModelCatalog,
  parseCandidatesJson,
} from './collectors/config.js';
import { runNavigator } from './run.js';
import { applyPolicyToAction } from './github/outputs.js';
import type { ModelCandidate } from './schemas/navigator.js';
import { sanitizeTaskText } from './utils/sanitize.js';

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = core.getInput(name);
  if (!raw) return fallback;
  return raw.toLowerCase() === 'true';
}

function resolveApiKey(jevProvider: string): string | undefined {
  if (jevProvider === 'vercel-ai-gateway') {
    return process.env.AI_GATEWAY_API_KEY || undefined;
  }
  if (jevProvider === 'typesafe-native') {
    return process.env.TYPESAFE_API_KEY || undefined;
  }
  // custom-compatible
  return (
    process.env.JEV_CUSTOM_API_KEY ||
    process.env.CUSTOM_JEV_API_KEY ||
    process.env.TYPESAFE_API_KEY ||
    process.env.AI_GATEWAY_API_KEY ||
    undefined
  );
}

function resolveCandidates(
  workspace: string,
  configCandidates: ModelCandidate[] | undefined,
  catalogPath: string | undefined,
): ModelCandidate[] {
  const raw = core.getInput('candidates');
  if (raw.trim()) {
    return parseCandidatesJson(raw);
  }
  if (configCandidates?.length) {
    return configCandidates;
  }
  const path = core.getInput('model_catalog_path') || catalogPath || '.jev/model-catalog.yml';
  return loadModelCatalog(workspace, path);
}

async function main(): Promise<void> {
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const config = loadJeConfig(workspace);

  const jev_provider = coalesceProvider(core.getInput('jev_provider') || undefined, config);
  const low_confidence_policy = coalescePolicy(
    core.getInput('low_confidence_policy') || undefined,
    config,
  );
  const budget_preference = coalesceBudget(
    core.getInput('budget_preference') || undefined,
    config,
  );

  const collected = collectFromPayload(
    github.context.payload as Record<string, unknown>,
  );
  const taskOverride = core.getInput('task');
  const task = sanitizeTaskText(taskOverride || collected.task);
  if (!task) {
    throw new Error(
      'No task text found. Open this Action on issues/pull_request events or pass input `task`.',
    );
  }

  const candidates = resolveCandidates(
    workspace,
    config.candidates,
    config.model_catalog_path,
  );

  const min_confidence = Number(
    core.getInput('min_confidence') || config.min_confidence || 0.7,
  );
  const decision_only = readBoolean(
    'decision_only',
    config.decision_only ?? true,
  );
  const comment_on_github = readBoolean(
    'comment_on_github',
    config.comment_on_github ?? false,
  );
  const dry_run = readBoolean('dry_run', false);
  const timeout_ms = Number(core.getInput('timeout_ms') || 45_000);
  const jev_endpoint = core.getInput('jev_endpoint') || config.jev_endpoint;
  const jev_model = core.getInput('jev_model') || config.jev_model;

  const token = core.getInput('github_token') || process.env.GITHUB_TOKEN;
  const octokit = token ? github.getOctokit(token) : null;
  const issueNumber =
    collected.number ??
    github.context.payload.issue?.number ??
    github.context.payload.pull_request?.number;

  const commentClient =
    octokit && issueNumber
      ? {
          async createComment(body: string) {
            await octokit.rest.issues.createComment({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              issue_number: Number(issueNumber),
              body,
            });
          },
        }
      : null;

  const signals = {
    ...collected.signals,
    source:
      collected.kind === 'issue' || collected.kind === 'pull_request'
        ? collected.kind
        : collected.signals.source,
  };

  core.info(`Jev provider: ${jev_provider}`);
  core.info(`Candidates: ${candidates.map(c => c.id).join(', ')}`);
  core.info(
    'Data sent to Jev: sanitized task summary, task signals, candidate metadata, budget preference, confidence constraints. Secrets are never sent.',
  );

  const result = await runNavigator({
    task,
    signals,
    candidates,
    min_confidence,
    decision_only,
    low_confidence_policy,
    jev_provider,
    budget_preference,
    jev_endpoint: jev_endpoint || undefined,
    jev_model: jev_model || undefined,
    timeout_ms,
    comment_on_github,
    dry_run,
    apiKey: resolveApiKey(jev_provider),
    commentClient,
  });

  applyPolicyToAction(
    {
      setOutput: (name, value) => core.setOutput(name, value),
      setFailed: message => core.setFailed(message),
      warning: message => core.warning(message),
      info: message => core.info(message),
    },
    result.outcome,
    result.summary,
  );

  core.info(`Comment: ${result.commentStatus}`);
  if (result.invokeDetail) core.info(result.invokeDetail);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(message);
});
