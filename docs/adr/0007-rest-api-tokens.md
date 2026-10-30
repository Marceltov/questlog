---
status: accepted
date: 2026-10-30
decision-makers: Marcel Bruckner
---

# The REST API is a second OAuth resource, which a client asks for when it registers

## Context and Problem Statement

The REST API (`/api/v1`, #5) follows MCP (V5). Scripts need tokens for it, and ADR 0004 and the engineering conventions (_MCP first, one domain layer_) say a token is bound to one surface: an MCP token fails on REST and the other way round. ADR 0006 wires Better Auth 1.7's `mcp()` plugin with one resource, `/mcp`. How does a script get a token for `/api/v1`, and which clients may?

## Decision Drivers

* One token, one surface: the audience decides, checked on every request.
* No sign-in code of questlog's own beyond configuration (ADR 0006).
* claude.ai registers itself (RFC 7591) and only ever needs `/mcp`; a client that only reads the log through MCP shouldn't hold a key to the API without asking.

## Considered Options

* **Every registered client may ask for either resource** (`/api/v1` among the defaults every client is linked to). Simple, but every MCP client could mint API tokens.
* **A client asks for `/api/v1` when it registers** (`resources` in its registration), allowed by `clientRegistrationAllowedResources`; every client is still linked to `/mcp` by default. (chosen)
* **Personal API keys** made on a settings page. A second credential type to store, show once, revoke and test; OAuth with PKCE already does it, and a script can run the flow once and keep the refresh token.

## Decision Outcome

Chosen: **a second resource, asked for at registration.**

* `mcp()` gets `resources: [${PUBLIC_URL}/api/v1]` and `clientRegistrationAllowedResources` with the same. Better Auth enforces per-client resources by default, so a client registered without asking (claude.ai) gets `invalid_target` for `/api/v1`.
* A script registers as a native client (`application_type: "native"`, a loopback redirect URI) with `resources: ["<PUBLIC_URL>/api/v1"]`, signs the player in with PKCE, and asks the token endpoint with `resource=<PUBLIC_URL>/api/v1`.
* `/api/v1` checks the token with `verifyAccessTokenRequest` from `better-auth/oauth2`: signature (keys over loopback, as `/mcp` fetches them), issuer, audience `/api/v1`, expiry, DPoP when bound; then that the player still exists. A refused request gets a 401 with `WWW-Authenticate` pointing at `/.well-known/oauth-protected-resource/api/v1`, which questlog serves itself (the `mcp()` plugin serves only `/mcp`'s).
* The session cookie doesn't count on `/api/v1`, as it doesn't on `/mcp`.

### Consequences

* Good, because one token can't cross surfaces, and MCP clients get nothing they didn't ask for.
* Good, because there is no credential type of questlog's own.
* Bad, because a script has to run an OAuth flow once instead of pasting a key; the reference page shows it.
