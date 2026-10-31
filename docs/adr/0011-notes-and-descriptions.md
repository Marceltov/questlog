---
status: accepted
date: 2026-10-31
decision-makers: Marcel Bruckner
---

# Notes and descriptions on everything the player keeps

## Context and Problem Statement

The player wants to add what they think to anything questlog keeps: a game, a run, a session, a quest, an item, a boss, a goal, a stat snapshot. Only the codex had `notes`, and those mixed what a thing is (an NPC's wares) with what the player thinks of it. Elsewhere a thought had nowhere to go but a quest's log or an item's `verdict`, which is Claude's judgement against the build.

## Decision Drivers

* The player's own words stay theirs, apart from what the game or a guide says (V1, V8).
* One way to do it everywhere, so Claude doesn't have to guess where a thought goes.
* Notes build up over sessions; a thought filed today shouldn't erase last week's.

## Considered Options

* **A notes table** linking to any row. One place, but a join from every read and a target type to check by hand.
* **A `notes` column where it is missing, and a `description` where a thing is described** (chosen).

## Decision Outcome

Chosen: **two columns, each with one meaning.**

* **`notes`:** the player's own thoughts in their words, never Claude's. On games, playthroughs, sessions, quests, stat snapshots, items, goals and the codex. `record` adds to them, a new paragraph each time (the same text twice is kept once); `correct` replaces them, or clears them with null. A log entry is a note already, and the link between an item and a codex entry has its own `note`; neither gets another.
* **`description`:** what a thing is, as the game or a guide says. On games, quests, items and the codex. `record` and `correct` replace it. Sessions have their summary, goals their text, so neither gets one.
* **Tools:** `record` takes `notes` and `description` on quests, items and codex entries, `notes` on goals and the snapshot, and `notes: { game, playthrough, session }` with `gameDescription` for the rest. `correct` takes `notes` on every target but an entry, and `description` on a game, quest, item or codex entry. Every read returns them.
* **Pages:** a description shows in muted text under a thing's name; the player's notes show set apart, in their own style, on the playthrough, the last session, goals, the snapshot, quests, items, codex entries and the session's page.

### Consequences

* Good, because the player can say what they think of anything, and it stays theirs.
* Good, because what the game says and what the player thinks no longer share a field.
* Neutral: the web app still doesn't edit; the player tells Claude, as with everything else (ADR 0001).
