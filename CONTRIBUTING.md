# Contributing

1. Use Node.js 24+.
2. Run `npm test` and `npm run build` before opening a PR.
3. Keep public identifiers, runtime messages, and docs in English.
4. Do not commit secrets or `.env` files.
5. Prefer additive schema changes; treat Action outputs as a SemVer contract.

## Layout

- `src/collectors` — Issue/PR and config loading
- `src/jev` — Jev providers and normalization
- `src/decision` — deterministic policies
- `src/executors` — comments / future runners
- `tests` — unit, contract, and integration tests
