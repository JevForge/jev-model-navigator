import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { provisionalPlanAction, planActionsWithJev, loadActionCatalog } from '../src/batch/plan.js';
import { loadModelCatalog } from '../src/collectors/config.js';

describe('batch planner', () => {
  it('loads the example action catalog with 30 actions', () => {
    const catalog = loadActionCatalog(resolve('examples/action-catalog.json'));
    expect(catalog.actions).toHaveLength(30);
  });

  it('marks provisional plans without inventing unknown model ids', () => {
    const candidates = loadModelCatalog(process.cwd(), 'examples/model-catalog.yml');
    const response = provisionalPlanAction(
      {
        id: '01-jev-model-navigator',
        repo: 'jev-model-navigator',
        title: 'JEV Model Navigator',
        objective: 'Select models for issue tasks',
        mvp_difficulty_hint: 'MEDIUM',
        audience_hints: ['DEV'],
      },
      candidates,
    );
    expect(response.provisional).toBe(true);
    expect(response.selected_model_id === null || candidates.some(c => c.id === response.selected_model_id)).toBe(true);
    expect(response.confidence).toBeLessThan(0.7);
  });

  it('writes responses for all actions provisionally', async () => {
    const dir = resolve('examples/responses');
    const candidates = loadModelCatalog(process.cwd(), 'examples/model-catalog.yml');
    const results = await planActionsWithJev(
      resolve('examples/action-catalog.json'),
      dir,
      candidates,
      null,
    );
    expect(results).toHaveLength(30);
    expect(results.every(r => r.provisional)).toBe(true);
  });
});
