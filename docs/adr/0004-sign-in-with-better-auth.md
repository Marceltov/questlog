---
status: accepted
date: 2026-10-30
decision-makers: Marcel Bruckner
---

# Sign-in with Better Auth, in its own SQLite file

Supersedes [ADR 0003](0003-sign-in-through-a-typescript-mcp-login-oauth.md).

## Context and Problem Statement

ADR 0003 chose a TypeScript mcp-login-oauth for questlog's sign-in. Then the wish list grew: magic links, passkeys, several OIDC providers, the web pages' own session, scripts calling the API, and a Python backend behind the UI later. mcp-login-oauth became Python only, the OAuth server for form-login FastMCP servers, and TypeScript apps sign in with [Better Auth](https://better-auth.com) instead ([TypeScript: use Better Auth](https://marceltov.github.io/mcp-login-oauth/typescript/), and _Sign-in_ in Marcel's [engineering conventions](https://marceltov.github.io/engineering-conventions/architecture/sign-in/)). How does questlog set Better Auth up?

## Decision Drivers

* Your log is yours alone (values V2): every read is scoped to the signed-in player, so the player's id must come from a checked sign-in on every surface.
* Self-hosting has everything (V7): one container, files on one volume, nothing calls home.
* The game log stays the player's data: a backup of it holds no sessions or tokens (ADR 0003).
* MCP first (V5): claude.ai connects as it does to freundebuch.

## Considered Options

* **Better Auth's tables in `questlog.sqlite`.** One file, and a foreign key from the log to the user. But sessions and tokens end up in every backup of the log.
* **Better Auth in its own `auth.sqlite`** next to `questlog.sqlite`. (chosen)

## Decision Outcome

Chosen: **Better Auth in the Next.js app, with its tables in `DATA_DIR/auth.sqlite`.**

### Players

* A player's id is Better Auth's `user.id`; questlog's tables carry it as `player_id`, without a foreign key across the two files.
* Who may sign up is decided by a hook on user creation. Deleting a user deletes their log in an `after` hook, in the same request.
* A person is identified by their verified email: a second sign-in joins the same player only when the provider says `email_verified: true` and is listed in `trustedProviders`.

### Sign-in methods

* **OIDC providers**, authentik first: built-in providers (Google, Apple) and `genericOAuth` for the rest. questlog reads `QUESTLOG_OIDC_<NAME>_ISSUER`, `_CLIENT_ID`, `_CLIENT_SECRET` and `_LABEL` and passes the list in.
* **Magic link and email code**, sent through `QUESTLOG_SMTP_URL` and `QUESTLOG_SMTP_FROM`. During an MCP or script sign-in the mail holds only the code, so that a sign-in someone else started can't be finished by clicking the mail.
* **Passkeys** (`@better-auth/passkey`), added in the settings while signed in.
* The sign-in and consent pages are questlog's own React pages.

### Surfaces

* **Pages:** Better Auth's `HttpOnly` session cookie; the browser holds no token.
* **MCP (`/mcp`):** `@better-auth/mcp` with `@better-auth/cimd`; tokens are bound to `/mcp`. Dynamic client registration is on, because claude.ai registers that way.
* **REST (`/api/v1`) for scripts:** a script signs in once through OAuth with PKCE, like an MCP client, and keeps its refresh token; its tokens are bound to `/api/v1`. A token for one surface fails on the other, as in freundebuch.
* **Headless scripts** use API keys (`api-key` plugin, stored hashed), sent as `x-api-key` to `/api/v1`. The plugin is added when the first such script exists; questlog's first version has none.
* **A Python backend later** checks JWTs from the `jwt` plugin against `/api/auth/jwks`, with a lifetime of 10 minutes; the pages reach it through a Next.js route that adds the token.

### Settings that differ from Better Auth's defaults

* `storeToken: "hashed"` for magic links and `storeOTP: "hashed"` for email codes, so `auth.sqlite` holds no usable link or code.
* No `bearer` and no `device-authorization` plugin. Better Auth keeps session tokens in plain text; without the `bearer` plugin, a token copied from `auth.sqlite` is useless, because the session cookie must carry a signature made with the secret.
* Telemetry stays off; nothing sets `telemetry.enabled` or `BETTER_AUTH_TELEMETRY`.
* The secret is `QUESTLOG_SECRET`, passed in as Better Auth's `secret`; Better Auth reads no other environment.

### Consequences

* Good, because questlog gets magic links, passkeys and any OIDC provider without sign-in code of its own, and a Python backend can join later without moving users.
* Good, because a backup or export of `questlog.sqlite` holds no sessions, tokens or passkeys.
* Bad, because there is no foreign key from the log to the user: deleting a user relies on the hook.
* Bad, because questlog builds its sign-in and consent pages itself.
* Bad, because questlog follows Better Auth's upgrades.
