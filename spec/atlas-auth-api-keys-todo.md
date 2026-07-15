# Atlas account and API-key handoff

This document records the remaining work after the initial Atlas App account portal
implementation.

## Implemented

- Better Auth: email/password, Google, and GitHub configuration.
- Transactional verification and password-reset email through Cloudflare Email Service.
- Public sign-up, sign-in, forgot-password, reset-password, and sign-out flows.
- Authenticated account settings: link/unlink Google and GitHub, add a password, and
  change a password.
- Authenticated API-key portal: create, reveal once, copy, revoke, show/hide revoked,
  and display last-used time.
- Generated meta migration `20260710183402_material_zodiak` for `user.role` and
  `api_key`.
- API-key management endpoints in Atlas App: `GET`, `POST`, and `DELETE /api/api-keys`.
- Fair-use policy at `/policy/fair-use`.
- API-key enforcement in Atlas API, including SHA-256 key lookup, revoked-key rejection,
  sampled `last_used_at` updates, usage recording, and fair-use rate limiting.
- Generated meta migration `20260710195313_famous_talisman` for `api_key_usage` counters
  and soft-limit notification state.

## Launch-critical

1. Apply and verify the meta migration in preview and production.
   - Confirm that `user.role` and `api_key` exist in both remote `DB_META` databases.
   - Do not handcraft migration snapshots; the generated migration is already in the
     worktree.

2. Apply the generated `api_key_usage` migration in preview and production.

3. Add the bootstrap administrator safely after the destination database contains the
   account.
   - Set the persisted `user.role` through an admin fixture or one-off database
     operation, never by comparing an email address at request time.
   - Preserve the `user` and `account` rows when copying databases between environments;
     OAuth provider account IDs are the portable identity, while environment-specific
     OAuth clients only affect the callback/consent flow.

4. Deploy and run an end-to-end preview verification.
   - Deploy the Atlas App changes, including `EMAIL` and OAuth configuration.
   - Verify Google and GitHub callback URLs for preview and production.
   - Test real verification and password-reset emails, including expired-token
     behaviour.
   - Confirm Cloudflare Email Service activity/delivery telemetry and suppression
     handling.

## Follow-up product work

- Add an admin-only key-management/usage view: search users, adjust per-key limits,
  revoke/suspend, and inspect abuse signals.
- Add an API usage view to the user portal.
- Update OpenAPI examples to state that `x-api-key` is required and document fair-use
  errors.
- Decide whether account email changes and account deletion should be self-service, then
  implement their verification/retention flows.
- Add explicit browser and endpoint tests for the account portal, password reset,
  API-key reveal-once behaviour, revocation, and the avatar menu.

## Existing unrelated failure

`bun run --filter atlas-app check` still reports a pre-existing TypeScript error in
`libs/core/src/lib/d1ImportApi.ts`: a `Uint8Array` is not accepted as `BodyInit`.
Resolve that separately before treating the workspace type check as clean.
