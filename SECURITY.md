# Security Policy

## Supported versions

Security fixes are applied to the latest release on the `v0` line.

## Reporting a vulnerability

Do **not** open a public Issue for secrets exposure, auth bypass, or other sensitive security problems.

Use GitHub’s private vulnerability reporting for this repository when available:

**Security → Report a vulnerability**

If private reporting is unavailable, contact a JevForge organization owner through GitHub without including secrets in the message body.

**Never** send API keys, tokens, or credentials in reports.

## Hardening notes (this Action)

- Issue and Pull Request bodies are **untrusted**. They are sanitized and truncated before being sent to Jev.
- Secrets (`AI_GATEWAY_API_KEY`, `TYPESAFE_API_KEY`, `JEV_CUSTOM_API_KEY`, `GITHUB_TOKEN`) must never be logged or written to outputs.
- Jev responses are validated against Zod schemas and candidate allowlists. Arbitrary strings never become shell commands, paths, or GitHub API operation names.
- Prefer `decision_only: true` unless a reviewed model invoke path is intentionally enabled.
- Use the minimum `GITHUB_TOKEN` permissions. Enable comments/labels only when needed.
- Do not silently fall back across `jev_provider` values; misconfiguration fails closed.
- Optional PR context sends **file metadata only** (paths and counts), never patch hunks.
