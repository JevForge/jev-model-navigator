# Security Policy

## Reporting

Report vulnerabilities privately to the JevForge maintainers. Do not open public issues for secrets exposure or auth bypass.

## Hardening notes

- Issue and Pull Request bodies are **untrusted**. They are sanitized and truncated before being sent to Jev.
- Secrets (`AI_GATEWAY_API_KEY`, `TYPESAFE_API_KEY`, `JEV_CUSTOM_API_KEY`, `GITHUB_TOKEN`) must never be logged or written to outputs.
- Jev responses are validated against Zod schemas and candidate allowlists. Arbitrary strings never become shell commands, paths, or GitHub API operation names.
- Prefer `decision_only: true` unless a reviewed `ModelRunner` integration is intentionally enabled.
- Use the minimum `GITHUB_TOKEN` permissions. Enable `comment_on_github` only when needed.
- Do not silently fall back across `jev_provider` values; misconfiguration must fail closed.
