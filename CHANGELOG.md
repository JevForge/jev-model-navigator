# Changelog

## 0.3.0

- Optional managed Issue/PR labels: `jev:decision:*`, `jev:model:*`, `jev:review`.
- Optional GitHub Check Run (`create_check_run`, default true) with success/neutral/failure from policy.
- Inputs `apply_labels` / `create_check_run`; outputs `label_status` / `check_status`.
- `dry_run` now also skips labels and check runs.

## 0.2.0

- Collect compact PR diff signals (file paths, languages, +/- counts, sensitive/test/infra flags) and send them to Jev.
- Add `include_pr_diff` input (default true) and outputs `diff_file_count`, `diff_languages`.
- Never send patch hunks or secrets — metadata only.
- Stop silent credential fallback for `custom-compatible` onto Gateway/TypeSafe keys.

## 0.1.1

- Shorten `action.yml` description to under 125 characters for GitHub Marketplace.

## 0.1.0

- Initial GitHub Action for Issue/PR model selection via Jev.
- Providers: `vercel-ai-gateway`, `typesafe-native`, `custom-compatible`.
- Stable outputs, confidence policies, optional comments, `decision_only` default.
- Optional batch planner CLI with provisional responses.
