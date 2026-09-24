# Contributing

Thanks for contributing to **JEV Model Navigator**.

## Requirements

- Node.js **24+**
- npm

## Setup

```bash
git clone https://github.com/JevForge/jev-model-navigator.git
cd jev-model-navigator
npm install
```

## Develop

```bash
npm test
npm run typecheck
npm run build
```

`dist/index.js` is the shipped Action entrypoint and must be rebuilt after TypeScript changes.

## Guidelines

- Keep public identifiers, runtime messages, and docs in **English**.
- Do not commit secrets, `.env`, or API keys.
- Prefer additive schema/output changes; treat Action outputs as a SemVer contract.
- Open Issues for bugs/features; open PRs against `main`.
- Never paste credentials into Issues, PRs, or logs.

## Project layout

| Path | Role |
| ---- | ---- |
| `src/collectors` | Issue/PR payload, config, diff signals |
| `src/jev` | Jev providers and normalization |
| `src/decision` | Deterministic confidence policy |
| `src/executors` | Comments, labels, check runs |
| `tests` | Unit and contract tests |
| `examples` | Workflow and catalog samples |

## Pull requests

Use the PR template checklist. Include a short summary of user-facing impact.
