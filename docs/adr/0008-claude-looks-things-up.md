---
status: accepted
date: 2026-10-30
decision-makers: Marcel Bruckner
---

# Claude looks things up; questlog keeps the player's sources and the facts with their links

Supersedes [ADR 0002](0002-on-demand-lookups-not-crawling.md).

## Context and Problem Statement

ADR 0002 chose on-demand lookups through source adapters: the server fetches one page about an item the player has, extracts the facts and keeps them with the link. It also said a source's terms decide whether it gets an adapter, and that Fextralife's terms had to be checked first.

They were checked on 2026-10-30. Fextralife belongs to Valnet. Its robots.txt (`liesofp.wiki.fextralife.com/robots.txt`) says that using "any robot, crawler, or other tool to scrape, harvest, extract, or retrieve any content on this website using automated means is prohibited without written permission from Valnet", and lists retrieval-augmented generation and data sets among the prohibited uses. Valnet's terms of use forbid "scrape, automatically download, data-mine, extract, collect, or harvest any content … by any means". A Fandom wiki answered a plain request with 403. The source the player uses most allows no adapter, and the others are not reliable from a server.

Meanwhile, Claude already reads the web in the conversation, at the player's request, with its own tools. That is how the build page in Trilium was written (ADR 0001).

## Decision Drivers

* V6: facts with a link, never a mirror; nothing looked up that the player hasn't found.
* A source's terms are respected; questlog doesn't get around a block.
* V5: the work happens in the conversation, over MCP.
* V7: nothing calls out from the server that the player didn't point it at.

## Considered Options

* **Source adapters** (ADR 0002). Ruled out for Fextralife by its terms; fragile for the rest.
* **No lookups at all.** Facts would be retyped into verdicts without links.
* **Claude looks things up, questlog guides and keeps** (chosen).

## Decision Outcome

Chosen: **questlog never fetches a page.**

* **Sources per game:** the player keeps the sites they trust for a game (a wiki, a guide), as `{ url, title }`, through `record` (`sources`) or `correct` (a game's `sources`). Claude may suggest one; the player decides whether it is kept.
* **Guidance in `next`:** when the player asks about an item, `item`'s `next` tells Claude to look it up with its own web tools on those sources, only about what the player has found. With no sources, it tells Claude to suggest a site and ask whether to keep it. If a source refuses Claude, Claude says so and suggests another.
* **Facts with their link:** an item keeps `sources`, each `{ url, title, facts, on }`. `facts` are what Claude took from the page in its own words (scaling, weight, where found), never the page's text. A link already there is refreshed, not added twice.
* **Spoilers:** an item's sources are part of the item, so they show only as far as the item does (V1). A game's sources are sites, not facts, and always show.
* **On the pages:** a playthrough's page lists the game's sources, and each item its facts and links.

### Consequences

* Good, because questlog has no network code, no adapters to break and no terms to argue with. A site's rules apply between the site and the player's own client.
* Good, because the player chooses where Claude looks, so it is the same site they would read themselves.
* Bad, because a client without web tools can't look anything up; questlog then keeps only what the player or Claude already know.
