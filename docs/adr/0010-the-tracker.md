---
status: accepted
date: 2026-10-30
decision-makers: Marcel Bruckner
---

# The tracker: the inventory with counts and numbers, and a codex of bosses, enemies, NPCs and places

## Context and Problem Statement

Items were the player's inventory in name only: a weapon's numbers (scaling, attack, weight, guard reduction) lived in its `verdict` text, nothing counted consumables or upgrade materials, and nothing said what an item is for. Bosses, enemies, NPCs and places were words in quest logs (`giver`, `location`, entries): "how do I beat this boss?", "what is it weak to?", "how often did I try?", "what did that NPC want?" had no answer questlog could give (#24, #25).

## Decision Drivers

* V1: only what the player met; what Claude or a guide adds is marked as a spoiler where it gives away more.
* V4: matched by id or exact name, never guessed.
* V8: names and numbers as the game shows them.
* V5: MCP first: filed through `record`, read through a tool made for the question.

## Considered Options

* **More fields on quests** (a boss as a quest). Bosses and enemies aren't tasks; weaknesses and tries don't fit a log.
* **One table per kind** (bosses, enemies, NPCs, places). Four nearly equal tables, tools and pages.
* **One codex with a kind, and links from items** (chosen).

## Decision Outcome

Chosen: **the inventory grows, a codex joins it, and what an item is good against links the two.**

* **Inventory:** an item has a `quantity` (null when it isn't counted) and `attributes`, its numbers as `{ name: value }` by the game's own names, merged by `record`, replaced by `correct`. `kind` stays free text; a known list (weapon, blade, handle, armour, amulet, consumable, material, collectible, key) is what the page groups by and what the tool's description offers.
* **Codex:** a row per boss, enemy, NPC or place the player met, matched by exact name within its kind, with a `status` (`met`, `beaten` with the day, `gone`), a boss's `attempts`, `weaknesses` and `resistances` (added up, case-insensitively), a `strategy`, `notes`, `sources` with facts (ADR 0008) and a spoiler level. Its gate is the same as quests' (ADR 0005).
* **Good against:** `item_uses` links an item to codex entries, with a note. It shows only when both ends may: an item marked as a spoiler isn't offered as a counter, and a hidden boss doesn't show in an item's links.
* **Tools:** `record` takes `codex`, and items take `quantity`, `attributes` and `against`. A new tool, `codex`, answers "how do I beat this?" with the entry, the player's counters and how many are left, the build and what is equipped; with nothing known yet, `next` points Claude at the game's sources. `briefing` lists the bosses met and not beaten. `correct` takes `codex`, and an item's count, numbers and links.
* **Pages:** a playthrough's page has a codex (bosses first, what is in the way before what is beaten) and the inventory grouped by kind, with counts and numbers.

### Consequences

* Good, because the questions asked at a boss door have answers from the player's own log, with what they carry.
* Good, because one codex shape serves every game: Lies of P's puppets and Elden Ring's NPCs alike.
* Bad, because NPCs and quests aren't linked yet: a quest's `giver` is still text. Linking them is a later step.
* Neutral: `attributes` are text or numbers as shown, not typed per game; comparing two weapons is Claude's work, with the numbers side by side.
