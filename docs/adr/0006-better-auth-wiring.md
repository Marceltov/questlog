---
status: accepted
date: 2026-10-30
decision-makers: Marcel Bruckner
---

# How Better Auth 1.7 is wired: JWT access tokens checked over loopback, closed sign-up, no trusted providers

## Context and Problem Statement

ADR 0004 decides that questlog signs in with Better Auth, in its own `auth.sqlite`, with the settings that differ from its defaults. Building it against Better Auth 1.7.14 raised questions ADR 0004 doesn't answer, and one point where its wording and the library disagree.

## Decision Drivers

* The rules of ADR 0004 and of the engineering conventions' _Sign-in_ and _Better Auth_ pages.
* No sign-in code of questlog's own beyond configuration and pages.
* A self-hosted instance on the internet must not be open to anyone with an email address.

## Considered Options

The options are listed per question, in the outcome.

## Decision Outcome

* **Access tokens are JWTs from the `jwt` plugin**, which `@better-auth/mcp` needs. They live 10 minutes (`accessTokenExpiresIn: 600`), because a JWT can't be revoked before it expires; clients refresh. Only the `authorization_code` and `refresh_token` grants are on, so every token names a player (no `client_credentials`).
* **`/mcp` checks tokens with `requireMcpAuth`** (signature, issuer, audience `${PUBLIC_URL}/mcp`, expiry, DPoP when bound) and then that the user still exists. It fetches the signing keys from its own process over loopback, `http://127.0.0.1:${PORT}/api/auth/jwks`, not through `PUBLIC_URL`: a server behind a reverse proxy often can't reach its own public address. Fetching them by a function instead would have meant verifying tokens with lower-level calls of our own.
* **`PUBLIC_URL` is required in production.** Better Auth's base URL, the issuer and the MCP resource are fixed at start-up; they can't come from a request as in freundebuch. In development it defaults to `http://localhost:${PORT}`.
* **Client registration:** `cimd()` with the `mcp-2026-07-28` profile, and dynamic client registration without a session, because claude.ai registers that way (ADR 0004).
* **Sign-up is closed by default:** `QUESTLOG_SIGNUP_ALLOW` lists addresses, `@domain` entries or `*`, checked in the user-creation hook. Empty lets nobody new in. No code is mailed to an address that may not sign up and isn't a player, so the instance can't be used to send mail to strangers.
* **No trusted providers.** ADR 0004 says a second sign-in joins a player "when the provider says `email_verified: true` and is listed in `trustedProviders`". In Better Auth 1.7 a provider in `trustedProviders` joins even without `email_verified`. So the list stays empty, and a sign-in joins an existing player only when its provider says the address is verified, which is what ADR 0004 means.
* **Email codes only, no magic link yet.** Codes are stored hashed (`storeOTP: "hashed"`), and a mail holds only the code, during an MCP sign-in or not. Magic links and passkeys can follow (they did: [ADR 0015](0015-passkeys-and-sign-in-links.md)).
* **OIDC providers** go through `genericOAuth`, one per `QUESTLOG_OIDC_<NAME>_*` block, with discovery and PKCE. In 1.7 they are social providers: `signIn.social` carries an MCP client's authorize request through the provider and back.
* **The REST API (`/api/v1`) is not in the first version.** MCP comes first (V5); the API and its token audience follow in their own change.

### Consequences

* Good, because everything that checks a token or a code is Better Auth's code; questlog has configuration, a hook and two pages.
* Good, because an instance that forgot to set `QUESTLOG_SIGNUP_ALLOW` is closed, not open.
* Bad, because the first sign-in needs `QUESTLOG_SIGNUP_ALLOW` set, which is one more step when setting up.
* Bad, because the loopback JWKS fetch assumes the server listens on 127.0.0.1 at `PORT`, which the image does (`HOSTNAME=0.0.0.0`) and `next dev` does.
* Bad, because a deleted player's token is refused only because `/mcp` looks the user up on each call; a backend that checks the JWT alone would accept it for up to 10 minutes.
