---
status: proposed
date: 2026-10-30
decision-makers: Marcel Bruckner
---

# questlog looks up sources on demand; it does not crawl them

## Context and Problem Statement

To say whether a weapon fits a build, or what an item needs, Claude reads wikis and guides (Fextralife, Fandom, Samurai Gamers, Steam threads). Marcel wants the questlog server to reach these sources itself, so that item facts are structured and sourced instead of retyped by Claude, and so that sources can be added later. How far should the server go?

## Decision Drivers

* Item and quest facts (scaling, Fable Arts, weight, where found) should be stored as data with a link to where they came from (values V6).
* No spoilers (V1): the server must not learn, store or show what the player hasn't found.
* The sources belong to others: their terms of use, robots.txt and licenses apply. Fextralife's terms were not checked yet; Fandom wikis are generally CC BY-SA, which allows reuse with attribution.
* One small container: no crawler fleet, queue or search index.

## Considered Options

* **Claude only** (today): Claude searches the web and files its verdict. Works now, but facts are retyped by hand, and claude.ai's web tools are not always available in every client.
* **Crawl the sources into a local game database.** Fast lookups and offline use, but it mirrors other people's work, likely against some sites' terms, needs constant re-crawling, and a full database of the game is exactly the spoiler source V1 rules out.
* **On-demand lookups through source adapters** (chosen): the server fetches one page about one thing the player has, when asked, extracts the facts it needs and keeps them with the link.

## Decision Outcome

Chosen option: on-demand lookups through source adapters.

* **A lookup is about something the player has found:** an item they picked up, a quest they started. The MCP tool `lookup` takes the item or quest and, optionally, a URL Claude already found; without one, the adapter builds the page URL from the name.
* **One adapter per source** (`fextralife`, `fandom`, …), registered per game. An adapter knows how to find a page and extract structured facts (for a weapon: scaling, base attack, weight, Fable Arts, where found). Adding a source is adding an adapter, not changing the schema (V8).
* **Facts and a link, never the page:** questlog stores the extracted fields, the URL, the source name and the fetch date. Quotes stay under the source's own limits; no page text is kept.
* **Polite by default:** robots.txt is honoured, each source has a rate limit and a cache (a page is fetched again only when it is stale or the player asks), the user agent names questlog and its repository.
* **A source's terms decide whether it gets an adapter.** Before an adapter ships, its source's terms of use are checked and the result is noted in the adapter. A source that forbids automated access gets none; Claude can still read it in the conversation.
* **Spoilers:** extracted facts carry the spoiler level of the item or quest they belong to. Fields that tell story or outcomes (lore text, quest endings) are not extracted.

### Consequences

* Good, because item facts become data with a source, and "does this fit my build?" becomes a comparison, not a guess.
* Good, because nothing is mirrored and nothing the player hasn't found is fetched.
* Bad, because adapters break when a site changes its layout; each needs tests against saved fixtures and a clear error that hands the lookup back to Claude.
* Bad, because questlog now calls out to the internet (V7 allows this: it goes where the player pointed it, nothing calls home).

### Open questions

* Fextralife's terms of use and robots.txt: does it allow this kind of lookup? Check before writing its adapter.
* Which sources first? Fextralife for Lies of P; a Fandom wiki as the CC BY-SA option.
