---
status: accepted
date: 2026-10-31
decision-makers: Marcel Bruckner
---

# How much Claude adds, and how much the player sees: two settings per playthrough

## Context and Problem Statement

Today Claude files only what the player said, and looks things up only when asked about an item (ADR 0008). Spoilers are hidden
unless the player asks in the moment (ADR 0005): the page has a "Show hints" link, the tools take `reveal`. Some players want more
while they play: what an item does, who a character is, the lore around a quest, how to go about a boss. How much differs per player
and per game, and so does how much they want given away. questlog needs both as settings of a playthrough, which Claude follows
without being reminded.

## Decision Drivers

* The player decides; Claude follows the setting and never goes past it on its own (V1, no spoilers unless asked).
* One gate stays the only way spoilers are filtered (ADR 0005).
* A new playthrough behaves exactly as today until the player raises a setting.
* The same behaviour in claude.ai and in the in-app chat: both go through the tools and their `next`.

## Considered Options

* **Two settings on each playthrough** (chosen).
* Defaults per player, with an override per playthrough: more to build and to explain; can be added later.
* Nothing stored, only what the player tells Claude: forgotten between conversations, unknown to the page, nothing holds Claude to it.

## Decision Outcome

Chosen: **two settings on each playthrough**, `background` and `spoilers`.

### The scales

`background`: how much Claude adds on its own when it files a session.

| Level | What Claude adds |
|---|---|
| `none` | Nothing; only what the player said (today) |
| `light` | One line on what each new item, character, place or quest is |
| `useful` | Plus stats and scaling, where things are found, a short lore note, a tip when it fits |
| `everything` | Full lore and story context, strategy, build advice: everything worth knowing |

`spoilers`: what the player sees without asking; the existing levels `none`, `hint`, `full`. Default `none`.

### Background lines

Background gets its own table, because a line can give away more than the row it is about (the item is `none`, the line about its
owner's fate is `full`):

* `background(id, player_id, what item|codex|quest, row_id, text, spoiler, source_url, source_title, created_at)`, with triggers that
  delete a row's lines with the row (as `tag_links`, ADR 0014). Every read goes through `seen()` with the line's own level.
* `text` is Claude's own words, never a page's text (ADR 0008); a line from the game's sources carries its link, a line from Claude's
  own knowledge has none.
* Claude writes them with `record` (on an item, codex entry or quest, `background: [{ text, spoiler, source? }]`), adds them after filing
  with `correct` (`addBackground` on an item, codex entry or quest, so no second session is filed), and fixes or removes them with
  `correct` (target `background`).
* The views (`itemsOf`, `codexOf`, `questsOf`) carry `background` lines at or below the reveal level of the read; the cards show them
  under the row, each with its link.

### Who follows the settings

* **Reads:** every tool read of a playthrough (`briefing`, `open_threads`, `item`, `codex`) uses the playthrough's `spoilers` as its
  default reveal; a `reveal` passed for this call can go higher. `briefing` keeps never going above the setting. `missed` is unchanged
  (it is asked for, with a warning).
* **Offering, not telling:** when a read leaves out something above the setting, its `next` says so in general terms ("there are hints
  for this quest the player hasn't asked for"), and tells Claude to offer, never to read it out unasked. Only after the player says
  yes does Claude ask again with `reveal`, and warn first. This is the existing "no hidden counts" rule loosened to one sentence: the
  tool may say that more exists, never what.
* **Adding:** after `record`, `next` carries the playthrough's `background` level and what it means for what was just filed: look up
  on the game's sources (ADR 0008) what is new in this session, at the level's depth, and file it as background lines with an honest
  spoiler level. At `none`, nothing. Claude says in one line what it added.
* **The instructions** (`mcp.ts` INSTRUCTIONS and the in-app chat's system prompt) name both settings: the player's choice, followed
  without exceptions; above `spoilers`, only offer.

### Setting them

* **On the playthrough page:** two segmented controls at the top of the playthrough's sheet, "Background" and "Spoilers", saved at
  once. "Show hints" goes: the spoiler control replaces it.
* **Through Claude:** `correct` on a playthrough takes `background` and `spoilers` ("more background in Elden Ring"); `next` tells
  Claude to read back what changed. Raising `background` doesn't fill in what was filed before on its own: `next` tells Claude to offer
  it ("shall I add background to what's already in the book?"), and only on a yes does it look things up for the playthrough's rows.
* **REST:** the playthrough JSON carries both, and `POST /api/v1/corrections` sets them, since it is `correct`. The briefing route follows
  the setting like the tool (one function); the other reads keep their explicit `reveal` (default `none`): a script asks for what it
  wants.
* **The in-app chat** reads the card it was opened on at the setting, as the page shows it.
* **The page's own setting wins over its address:** `?hints=1` goes with the link it came from.

### Consequences

* Good, because the player sets it once per game, and both claude.ai and the in-app chat follow it.
* Good, because raising `spoilers` shows what was already filed, without filing it again.
* Bad, because `background` above `none` makes filing slower and costs web look-ups on every session.
* Bad, because a tool now says that something hidden exists, which ADR 0005 ruled out; the sentence names no count and no content.

