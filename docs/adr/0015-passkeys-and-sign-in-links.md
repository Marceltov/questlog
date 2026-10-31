---
status: accepted
date: 2026-10-31
decision-makers: Marcel Bruckner
---

# Passkeys and sign-in links

## Context and Problem Statement

ADR 0004 promised passkeys (added in the settings while signed in) and magic links (stored hashed; during an MCP or script sign-in the
mail holds only a code). The first version had email codes and OpenID Connect providers only (ADR 0006). How do the two join without a
second mail, a second form, or a way to finish someone else's MCP sign-in from a mail?

## Considered Options

* **One mail, the code and the link together**, the link left out during an MCP or script sign-in.
* A separate "mail me a link" button next to "send me a code".
* Links instead of codes outside an MCP sign-in.

## Decision Outcome

Chosen: **one mail with the code and, outside an MCP or script sign-in, the link**. The player asks once and picks in the mail: type the
code here, or open the link on the device they read the mail on. A second button would make them choose before they know where they'll
read the mail; links alone would lose the phone-reads-mail, laptop-signs-in case the code covers.

* **Which sign-ins get a link.** The login page an MCP client or a script sends the browser to carries Better Auth's signed authorize
  query, and its browser client sends that query (`oauth_query`) with every request from the page. A `hooks.before` notes it in request
  state (`defineRequestState`), because the endpoint's own body has it stripped. With it, the mail holds only the code: a link would sign
  in whichever browser opens it, not the one the authorization waits in.
* **How the link is made.** While the code mail is written, questlog calls Better Auth's `magicLink` endpoint for the same address and
  catches the URL it would mail (an `AsyncLocalStorage` slot). The plugin's `sendMagicLink` sends nothing itself, so a direct call to
  `/sign-in/magic-link` mails no one. Links are stored hashed (`storeToken: "hashed"`), work once and for five minutes, and lead to the
  login page's `next`, read off the Referer and checked like every `next`.
* **Passkeys** come from `@better-auth/passkey`. questlog is the relying party at the host of `PUBLIC_URL`. A signed-in player adds
  and removes them on the account page (`/account`, linked from the header); signing in offers them as a button and in the address
  field's autofill (conditional mediation). Because the browser client sends the signed query with the passkey sign-in too, a passkey
  finishes an MCP sign-in like a code does.

### Consequences

* Good, because nobody types a code on the device they read the mail on, and nobody reaches for their email at all once they have a passkey.
* Good, because the passkey table is in `auth.sqlite`: a backup of `questlog.sqlite` holds no public keys either.
* Bad, because the link is made through a nested call to Better Auth's own endpoint; an upgrade that changes how `sendMagicLink` is called
  shows in `oauth.test.ts`, which checks the mail carries a working link.
* Bad, because changing `PUBLIC_URL`'s host invalidates every passkey: they are bound to it.
