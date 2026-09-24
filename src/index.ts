import * as core from '@actions/core';
import * as github from '@actions/github';
import { collectFromPayload, enrichWithDiff } from './collectors/github-event.js';
import { collectPullDiffSignals } from './collectors/pull-diff.js';
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
  return process.env.JEV_CUSTOM_API_KEY || process.env.CUSTOM_JEV_API_KEY || undefined;
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

  let collected = collectFromPayload(
    github.context.payload as Record<string, unknown>,
  );
  const taskOverride = core.getInput('task');
  const task = sanitizeTaskText(taskOverride || collected.task);
  if (!task) {
    throw new Error(
      '[JEV Model Navigator] No task text found. Use issues/pull_request events or pass input `task`.',
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
  const apply_labels = readBoolean('apply_labels', false);
  const create_check_run = readBoolean('create_check_run', true);
  const dry_run = readBoolean('dry_run', false);
  const include_pr_diff = readBoolean('include_pr_diff', true);
  const timeout_ms = Number(core.getInput('timeout_ms') || 45_000);
  const jev_endpoint = core.getInput('jev_endpoint') || config.jev_endpoint;
  const jev_model = core.getInput('jev_model') || config.jev_model;

  const token = core.getInput('github_token') || process.env.GITHUB_TOKEN;
  const octokit = token ? github.getOctokit(token) : null;
  const issueNumber =
    collected.number ??
    github.context.payload.issue?.number ??
    github.context.payload.pull_request?.number;

  if (
    include_pr_diff &&
    collected.kind === 'pull_request' &&
    issueNumber &&
    octokit
  ) {
    try {
      const diff = await collectPullDiffSignals(Number(issueNumber), {
        async listFiles(pullNumber) {
          const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: pullNumber,
            per_page: 100,
          });
          return files.map(f => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            changes: f.changes,
            previous_filename: f.previous_filename,
          }));
        },
      });
      collected = enrichWithDiff(collected, diff);
      core.info(
        `PR diff signals: files=${diff.file_count} +${diff.additions}/-${diff.deletions} langs=${diff.languages.join(',') || 'none'}`,
      );
      core.setOutput('diff_file_count', String(diff.file_count));
      core.setOutput('diff_languages', JSON.stringify(diff.languages));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      core.warning(`[JEV Model Navigator] Failed to collect PR diff signals: ${message}`);
    }
  }

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

  const labelClient =
    octokit && issueNumber
      ? {
          async listLabels() {
            const issue = await octokit.rest.issues.get({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              issue_number: Number(issueNumber),
            });
            return (issue.data.labels ?? [])
              .map(label => (typeof label === 'string' ? label : label.name))
              .filter((name): name is string => typeof name === 'string');
          },
          async ensureLabel(name: string) {
            try {
              await octokit.rest.issues.createLabel({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                name,
                color: '0E8A16',
                description: 'Managed by JEV Model Navigator',
              });
            } catch (error) {
              const status =
                error && typeof error === 'object' && 'status' in error
                  ? Number((error as { status?: number }).status)
                  : undefined;
              if (status !== 422) throw error;
            }
          },
          async setLabels(next: string[]) {
            await octokit.rest.issues.setLabels({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              issue_number: Number(issueNumber),
              labels: next,
            });
          },
        }
      : null;

  const headSha =
    github.context.payload.pull_request?.head?.sha ??
    github.context.sha ??
    null;

  const checkRunClient = octokit
    ? {
        async createCheckRun(input: {
          name: string;
          headSha: string;
          conclusion: 'success' | 'neutral' | 'failure';
          title: string;
          summary: string;
        }) {
          await octokit.rest.checks.create({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            name: input.name,
            head_sha: input.headSha,
            status: 'completed',
            conclusion: input.conclusion,
            output: {
              title: input.title,
              summary: input.summary,
            },
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
    'Data sent to Jev: sanitized task summary, task signals, optional PR diff metadata (paths/counts only), candidate metadata, budget preference, confidence constraints. Secrets and patch hunks are never sent.',
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
    apply_labels,
    create_check_run,
    dry_run,
    head_sha: headSha,
    apiKey: resolveApiKey(jev_provider),
    commentClient,
    labelClient,
    checkRunClient,
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

  core.setOutput('label_status', result.labelStatus);
  core.setOutput('check_status', result.checkStatus);
  core.info(`Comment: ${result.commentStatus}`);
  core.info(`Labels: ${result.labelStatus}`);
  core.info(`Check run: ${result.checkStatus}`);
  if (result.invokeDetail) core.info(result.invokeDetail);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  const prefixed = message.startsWith('[JEV Model Navigator]')
    ? message
    : `[JEV Model Navigator] ${message}`;
  core.setFailed(prefixed);
});
