# MCP tools

Every tool runs as the signed-in player and reads through the one gate ([ADR 0005](../adr/0005-spoiler-levels-and-one-gate.md)): only the player's own log, and only what they found unless they asked for more. Every result carries `next`, short instructions for Claude worked out from what the call did, and every playthrough, session, quest and item comes with its URL in the web app.

## record

Files one play session: the player's words verbatim as `transcript`, a `summary`, and what was learned from it.

- **Which playthrough:** `playthroughId`, or `game` (a title). An unknown title starts a game and its playthrough `NG`; a `label` such as `NG+` picks or starts that playthrough. Two playthroughs being played and no label: questlog refuses and asks Claude to ask.
- **`quests`:** each by `id` or exact `name` in the playthrough (otherwise a new quest), with `localName`, `giver`, `location`, `status` (`open`, `blocked`, `done`, `failed`, `dropped`) and `entries`: `log`, `next` (a vague next step) or `decision`, each with a `spoiler` level (`none` by default; `hint` or `full` for what the player hasn't reached).
- **`stats`:** a snapshot, `{ level, values: { key: number } }`; a key the game hasn't had gets its English and its own name through `names`.
- **`build`:** the plan: `summary`, `mainStat`, and `targets` as a short way to set stat goals (`{ vigor: 20 }`).
- **`goals`:** long-term goals ([ADR 0009](../adr/0009-goals-and-the-character.md)), in order: `kind` `stat` (`stat`, `target`), `level` (`target`), `item` (`item`: its id or exact name) or `note` (`text`), each with an optional `text` saying why, a `rank` (1 first; default last), `suggested` for a goal Claude or a guide proposes and the player hasn't agreed to, and a `spoiler` level. A new target for a stat replaces its open goal, which is kept as dropped. `id` changes a goal: accept a suggestion (`suggested: false`), re-rank it, mark an item or note goal `reached`, or `dropped`. Stat and level goals are reached on their own when a snapshot gets there.
- **`character`:** who the player plays in this run: `name`, `class` and `localClass`.
- **`carryFrom`:** with a new `label` (NG+): the playthrough to take the character, the build plan and the open goals from, only when the player wants it.
- **`items`:** by `id` or exact `name`, with `kind`, `location`, `equipped`, `verdict`, a `spoiler` level and `sources`: the pages its facts come from, each `{ url, title, facts }`, merged by link.
- **`sources`:** the sites the player trusts for this game, each `{ url, title }`, merged by link. Claude looks things up there ([ADR 0008](../adr/0008-claude-looks-things-up.md)).

`next` asks Claude to read back what was filed, to check new quests against open ones, to confirm a quest marked done, to tell the player which goals the snapshot reached, to ask about suggested goals and what was carried over, and notes new stat keys and filed spoilers.

## briefing

"Where was I?" for one playthrough (`playthroughId`, or `game`, or the one played most recently): the last session, the open quests (open, then waiting on the game) with their next step and last log line, the build plan with its goals (open ones in order with where the latest snapshot is, then suggestions, then what was reached) and the latest stats with their change, what is equipped, and the player's other playthroughs. `next` names the plan in order. It never contains a spoiler.

## open_threads

The quests that are open or waiting on the game, each with its whole log. `reveal` is `none` unless the player asked for hints in this conversation; `hint` adds hints, `full` everything. With a `reveal`, `next` tells Claude to warn before reading them out.

## item

The player's items in one playthrough: one by `name` (part of it is enough, in English or the game's own language), or all of them, with the build plan, the latest stats and what is equipped, so Claude can say whether a new find fits. Items marked as spoilers show only with a `reveal`. A name the player hasn't filed returns nothing, and `next` asks Claude to file it with `record` rather than describe it from its own knowledge.

questlog never fetches a page ([ADR 0008](../adr/0008-claude-looks-things-up.md)). When the player wants to know more, `next` tells Claude to look it up with its own web tools on the game's sources, only about what the player has found, and to file the facts in its own words with the link. Without sources, it tells Claude to suggest a site and ask whether to keep it.

## correct

Fixes or removes what was filed, in `changes`: each names one row by `what` (`game`, `playthrough`, `session`, `quest`, `entry`, `snapshot`, `item`, `goal`) and `id`, and either sets some of its fields or `remove`s it. All changes of one call apply together or not at all.

- **What each takes:** a game its `title`, `platform` and `sources`; a playthrough its `label`, `language`, `status` (`playing`, `finished`, `dropped`), `characterName`, `characterClass` and `characterLocalClass`; a session its `summary` and `playedOn` (its stat snapshot moves with it); a quest its `name`, `localName`, `giver`, `location` and `status`; an entry its `kind`, `text` and `spoiler`; a snapshot its `level`, `values` (only the stats named change) and `playedOn`; an item its `name`, `localName`, `kind`, `location`, `equipped`, `verdict`, `spoiler` and `sources`; a goal its `target`, `text`, `status` (`open`, `reached`, `dropped`), `suggested`, `rank` and `spoiler` (a lowered target the latest snapshot meets is reached at once). Any other field is refused; `sources` replaces the whole list, so a link left out is dropped; a nullable field set to `null` is cleared.
- **Removing:** a game or a playthrough takes everything filed in it along; a session its log entries and its snapshot, while the quests and items it started stay; a quest its entries.
- **Merging:** two quests are never merged unless asked: `mergeInto` on a quest moves its entries to the quest it really is and removes it, and Claude passes it only after the player agreed. A rename to a name another quest, item, game or playthrough already has is refused.

The ids come from `briefing`, `open_threads`, `item` and `record`. `next` asks Claude to read back each change and says that a removal can't be undone.

## missed

"Did I miss anything?", only when the player asks, after Claude warned them, and at the level they agreed to: `reveal` is required, `hint` or `full`. questlog knows only the player's own log (values V6), so it returns:

- **`leftBehind`:** open quests that haven't changed in the playthrough's last three sessions, in the player's own words.
- **`hidden`:** the open quests' entries above `none`, the hints and spoilers Claude filed that other reads leave out.
- **`hiddenItems`:** the items marked as hints or spoilers.

`next` has Claude name the threads left behind first, read out the rest one quest at a time, and, if the player wants more than their log holds, say that what follows is Claude's own knowledge of the game, at the level they asked for.
