---
status: accepted
date: 2026-10-30
decision-makers: Marcel Bruckner
---

# Sign-in through a TypeScript mcp-login-oauth, with its own SQLite file

## Context and Problem Statement

questlog needs what freundebuch and notefeed already have: an OAuth server for MCP clients such as claude.ai, whose authorize step is a sign-in. Both carry their own hand-written copy of it, and freundebuch's ADR 0003 lists the weak spots of that copy: used codes are tracked only in memory, so one can be replayed after a restart; a single client can't be revoked, only everyone at once by rotating the secret; anyone can register a client. questlog would be the third copy.

On the Python side Marcel solved the same problem once: [mcp-login-oauth](https://github.com/Marceltov/mcp-login-oauth) (its ADR 0001) replaced four drifting copies in his FastMCP servers with one library. The app supplies only how a login is checked; the library owns the OAuth server, an encrypted store that survives restarts, revocation (including for public clients) and protection against password guessing.

Two questions: does questlog copy freundebuch's OAuth code or use a shared library, and where does that library keep its data?

## Decision Drivers

* Fix once, for every app: no third copy that drifts (the reason for the Python library).
* Per-client revocation and no replay after a restart.
* questlog signs in through any OIDC provider, authentik first (ADR 0001); other apps check a form against a service instead.
* One container and one data volume per app (values V7).
* The game log stays the player's data: exports and backups of it hold no tokens.

## Considered Options

For the code:

* **Copy freundebuch's OAuth code.** Fastest start, but a third copy with the same weak spots.
* **A TypeScript mcp-login-oauth**, the sibling of the Python library. (chosen)
* **An external authorization server** (authentik as the OAuth server for MCP clients). Rejected in freundebuch's ADR 0003 for reasons that hold here: a client registered in authentik per connection, tokens that don't carry the app's user id, a foreign token format to validate.

For the data:

* **Tables in the app's own database.** One file, and deleting a user can remove their tokens through a foreign key. But every app has to carry the library's migrations in its own list, the wiring drifts between apps, and tokens end up in every backup and export of the user's data.
* **An own SQLite file owned by the library**, next to the app's database in the same data folder. (chosen)

## Decision Outcome

Chosen options: a TypeScript mcp-login-oauth that keeps its data in its own SQLite file.

* **The library owns the OAuth server:** RFC 8414 and RFC 9728 metadata, Dynamic Client Registration (RFC 7591), authorization code with PKCE `S256`, rotating refresh tokens, revocation for public clients, tokens bound to a resource (RFC 8707) and the issuer on the code redirect (RFC 9207). Lifetimes and behaviour match the Python library.
* **The app supplies how a login is checked**, in one of two kinds: a **form** checked by a callback (as in Python's `check_login`), or an **OIDC redirect** to a provider (authentik for questlog and freundebuch). Either returns the grant: for questlog, the player's id.
* **Framework-neutral:** handlers take a web `Request` and return a `Response`, so they mount in Next.js route handlers and anywhere else. The MCP route asks the library for the grant behind a bearer token.
* **Its own SQLite file** (`oauth.sqlite` in `DATA_DIR`, next to `questlog.sqlite`), with the library's own migrations. Grants that hold service credentials are encrypted with a key derived from the app's secret.
* **A store interface** with that SQLite file as the default, so an app could plug in another store later without the library changing.
* **Deleting a player calls `revokeUser(id)`**, which ends every grant of that player.

### Consequences

* Good, because questlog, freundebuch and notefeed get the same sign-in, and a fix lands once.
* Good, because the store closes freundebuch's gaps: no replay of used codes after a restart, and one client can be revoked without logging out everyone.
* Good, because the player's game data and the login data are apart: losing or deleting `oauth.sqlite` only makes connected clients sign in again, and an export of the log holds no tokens.
* Bad, because the library has to be written before questlog can sign anyone in.
* Bad, because there are two files to back up, though both sit in the same folder on the same volume.
* Bad, because user deletion needs an explicit `revokeUser` call instead of a foreign key.
* Bad, because freundebuch and notefeed lose their current logins when they migrate: connected clients sign in once more.

### Repository and distribution

Decided by Marcel, 2026-10-30:

* **Same repository as the Python library**, [Marceltov/mcp-login-oauth](https://github.com/Marceltov/mcp-login-oauth), so both share the ADRs and the test cases. The Python package stays at the root, where its four users pin it; the TypeScript package goes into `typescript/`.
* **Tags:** Python keeps `v0.x.y`; TypeScript releases are tagged `ts-v0.x.y`.
* **Distribution:** npm can't install a package from a subfolder of a git repository ([npm/npm#2974](https://github.com/npm/npm/issues/2974), [npm/cli#513](https://github.com/npm/cli/issues/513)). On a `ts-v*` tag, CI runs `npm pack` and attaches the tarball to the GitHub release; apps depend on that tarball's URL, pinned like the Python tag. Publishing to npm can follow later.
