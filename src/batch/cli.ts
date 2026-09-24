#!/usr/bin/env node
import { resolve } from 'node:path';
import { planActionsWithJev } from './plan.js';
import { loadModelCatalog } from '../collectors/config.js';
import { createJevProvider } from '../jev/factory.js';
import type { JevProviderId } from '../schemas/enums.js';

async function main() {
  const workspace = process.cwd();
  const catalogPath = resolve(
    workspace,
    process.env.ACTION_CATALOG_PATH || 'examples/action-catalog.json',
  );
  const responsesDir = resolve(
    workspace,
    process.env.RESPONSES_DIR || 'examples/responses',
  );
  const catalogModelsPath =
    process.env.MODEL_CATALOG_PATH || 'examples/model-catalog.yml';

  let candidates: ReturnType<typeof loadModelCatalog> = [];
  try {
    candidates = loadModelCatalog(workspace, catalogModelsPath);
  } catch {
    candidates = [];
  }

  const providerId = (process.env.JEV_PROVIDER || '') as JevProviderId | '';
  const apiKey =
    process.env.AI_GATEWAY_API_KEY ||
    process.env.TYPESAFE_API_KEY ||
    process.env.JEV_CUSTOM_API_KEY;

  const provider =
    providerId && apiKey
      ? createJevProvider({
          provider: providerId,
          apiKey,
          endpoint: process.env.JEV_ENDPOINT,
          model: process.env.JEV_MODEL,
          timeoutMs: 45_000,
        })
      : null;

  const results = await planActionsWithJev(
    catalogPath,
    responsesDir,
    candidates,
    provider,
  );

  const provisional = results.filter(r => r.provisional).length;
  console.log(
    `Wrote ${results.length} responses to ${responsesDir} (${provisional} provisional)`,
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
