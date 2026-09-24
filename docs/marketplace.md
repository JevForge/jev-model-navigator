# Marketplace listing

## Status

- Repository: https://github.com/JevForge/jev-model-navigator
- Release: https://github.com/JevForge/jev-model-navigator/releases/tag/v0.1.0
- Marketplace publish page (requires browser 2FA):  
  https://github.com/JevForge/jev-model-navigator/releases/edit/v0.1.0

GitHub does **not** allow publishing Actions to the Marketplace via API/`gh`. An organization owner must:

1. Accept the [GitHub Marketplace Developer Agreement](https://docs.github.com/en/free-pro-team@latest/github/site-policy/github-marketplace-developer-agreement) if not already accepted for **JevForge**.
2. Open the release edit URL above.
3. Check **Publish this Action to the GitHub Marketplace**.
4. Fill primary category (suggested: **AI Assisted** or **Continuous Integration**), short description, and confirm with 2FA.
5. Save / publish the release.

## Listing draft

- **Name:** JEV Model Navigator
- **Categories:** AI Assisted, Continuous Integration
- **Short description:** Select the right AI model for an Issue or PR using TypeSafe Jev.
- **Supports:** Issues, Pull Requests
- **Required secrets:** `AI_GATEWAY_API_KEY` (default) or TypeSafe/custom secrets
- **Permissions:** `contents: read`; optional `issues: write` / `pull-requests: write` for comments
- **Icon / color:** compass / blue (from `action.yml` branding)
