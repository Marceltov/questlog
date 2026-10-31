---
status: accepted
date: 2026-10-30
decision-makers: Marcel Bruckner
---

# Three spoiler levels, and one gate that scopes every read to its player and to the levels asked for

## Context and Problem Statement

Values V1 and V2 are lines never crossed: nothing the player hasn't found is shown unless they asked, and nobody sees another player's log. ADR 0001 says every quest, item and note has a spoiler level and one function decides what a read returns. What are the levels, where do rows that give something away come from, and what does the one function look like?

## Decision Drivers

* V1: a briefing, a reminder or a tool result the player didn't ask for never gives anything away; no counts or percentages that reveal how much is left.
* V2: every read is scoped to the signed-in player, counts and summaries included.
* One function, tested once with a seed that has rows on both sides of each rule (engineering conventions, _One gate for every read_).
* What the player tells is, by definition, something they found. Claude, though, may file a next step or a verdict from its own knowledge of the game, or from a lookup (ADR 0002).

## Considered Options

* **A boolean "found"** on each row. Simple, but a hint ("try near the station") and a full spoiler ("Venigni dies if you wait") would be one thing, and a player who wants a nudge would get the outcome too.
* **Three levels** on each row that can give something away: `none`, `hint`, `full`. (chosen)
* **Spoiler checks in each read** (a `where` in every query that needs it). Rejected: the one that is forgotten is the count nobody looks at.

## Decision Outcome

* **Levels:** `none` (the player found or told it), `hint` (names a place, person or item the player hasn't reached, but no outcome) and `full` (names a boss, an outcome or a story event). They are ordered; a read that asks for `hint` sees `none` and `hint`.
* **Which tables carry one:** quests, quest entries (log lines, next steps, decisions) and items. A quest the player tells of is always stored as `none`; record takes no level for it. Entries and items take one, `none` by default; the tool descriptions tell Claude that a next step from its own knowledge is at least `hint`. Sessions, stat snapshots and build plans are the player's own numbers and words, and carry none.
* **Every table carries `player_id`**, so the gate needs no joins. It is Better Auth's `user.id` (ADR 0004), without a foreign key across the two files.
* **The gate is `seen(query, player, table, reveal = "none")`** in `backend/spoilers.ts`: `table.player_id = player` and, for the three tables above, `table.spoiler in (levels up to reveal)`. Every query on a table of the schema goes through it, look-ups for a write and counts included. A row of another player is not found, the same answer as a row that doesn't exist.
* **Who may ask for more:** `briefing` never does. `open_threads` takes `reveal`, described as "only when the player asked for hints in this conversation", and its `next` tells Claude to warn before reading them out. The web app's playthrough page shows hints after a "Show hints" click, behind a warning; full spoilers aren't shown there. A list of what the player might have missed (`missed`, ADR 0001) is a later tool.
* **No hidden counts:** no read says how many rows it left out. (Since [ADR 0016](0016-background-and-spoilers.md) a read may say that there is more above the player's spoiler setting, as a yes or no, so Claude can offer it; still never how much or what. The setting also replaces the page's "Show hints" click.)

### Consequences

* Good, because both lines never crossed are one function with one test file each (`spoilers.test.ts`, `isolation.test.ts`), and a new read path either uses it or is visibly wrong in review.
* Good, because a hint and a full spoiler can be told apart, so a player asking for a nudge doesn't get the ending.
* Bad, because the level of an entry is Claude's judgement when it files it; a mislabelled one shows too early. The tool descriptions and `next` say so, and V4 keeps the player in the loop.
* Bad, because `player_id` is repeated on every row instead of being reached through the playthrough; writes have to set it each time.
