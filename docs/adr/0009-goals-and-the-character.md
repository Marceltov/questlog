---
status: accepted
date: 2026-10-30
decision-makers: Marcel Bruckner
---

# Goals are rows of their own, apart from what happened; the character is the playthrough's

## Context and Problem Statement

A playthrough's build was a single plan: a `summary`, a `mainStat` and `targets` as `{ stat: value }`, overwritten by every `record`. What happened (sessions, dated stat snapshots) was kept; what the player wants to get to was not. Planning the Lies of P build showed what that loses: the order ("Vigor straight to 20, then Technique") lived only in the free-text summary; raising Vitality from 20 to 25 left no trace; whether a target was met had to be worked out by hand; goals that aren't a stat (keep the Fire Axe's blade for a Technique handle, stay under 60 % load) had nowhere to go; and the class (Path of the Bastard) was only words in the summary.

## Decision Drivers

* V3: the player's progress in their words; a decision stays with the session it was made in.
* V4: nothing filed as the player's that they didn't decide.
* V1: a goal Claude or a guide proposes can name what the player hasn't reached.
* V5: MCP first; briefing says what comes next.

## Considered Options

* **Keep the plan, add an order to `targets`.** Still overwritten, still stats only.
* **Free-form goals in the plan's summary.** Nothing a program can rank, reach or show.
* **Goals as rows of their own** (chosen).

## Decision Outcome

Chosen: **a `goals` table per playthrough, and the character on the playthrough.**

* **A goal** is `stat` (a stat to a value), `level`, `item` (something to do with one of the playthrough's items) or `note`, with an optional reason, a `rank` (1 first), a `status` (`open`, `reached`, `dropped`), the session it was set in, `suggested`, and a spoiler level like a quest entry's.
* **Reached on its own:** a stat or level goal becomes `reached` when a snapshot gets there, on the snapshot's day (record, and correct on a snapshot or a goal). Item and note goals are reached when the player says so.
* **Nothing is lost:** a new target for a stat replaces the open goal, which is kept as `dropped` and leaves its place to the new one; giving a goal up drops it. `correct` can still remove one.
* **Suggestions:** Claude may file goals it or a guide proposes, as `suggested`, shown apart from the player's plan; `next` asks the player, and `record` with the goal's id and `suggested: false` makes it theirs (V4). A suggestion that names something the player hasn't reached is filed as `hint` or `full` and stays out of every read that didn't ask (V1).
* **The plan stays** for `summary` and `mainStat`; its `targets` are now read from the player's stat goals, and `record`'s `build.targets` is a short way to set them. Migration 003 turned every plan's targets into goals, reached where the latest snapshot already was.
* **The character** (`name`, `class`, `localClass`) belongs to the playthrough, since a run is one character. A new playthrough can take it along, with the build plan and the open goals, through `carryFrom`, only when the player wants it; item goals stay behind with their items.

### Consequences

* Good, because briefing can say what comes next from data ("Vigor 12 → 20, then Technique 11 → 40"), and the page shows the plan with progress.
* Good, because the history of the plan is kept: what was reached when, what was dropped.
* Bad, because there are two ways to set a stat goal (`build.targets` and `goals`); `targets` is kept as the short form so existing calls keep working.
* Neutral: the old `targets` column stays in `build_plans` (a shipped migration made it) and is no longer written.
