# MCP tools

Every tool runs as the signed-in player and reads through the one gate ([ADR 0005](../adr/0005-spoiler-levels-and-one-gate.md)): only the player's own log, and only what they found unless they asked for more. Every result carries `next`, short instructions for Claude worked out from what the call did, and every playthrough, session, quest and item comes with its URL in the web app.

## record

Files one play session: the player's words verbatim as `transcript`, a `summary`, and what was learned from it.

- **Which playthrough:** `playthroughId`, or `game` (a title). An unknown title starts a game and its playthrough `NG`; a `label` such as `NG+` picks or starts that playthrough. Two playthroughs being played and no label: questlog refuses and asks Claude to ask.
- **`quests`:** each by `id` or exact `name` in the playthrough (otherwise a new quest), with `localName`, `giver`, `location`, `status` (`open`, `blocked`, `done`, `failed`, `dropped`) and `entries`: `log`, `next` (a vague next step) or `decision`, each with a `spoiler` level (`none` by default; `hint` or `full` for what the player hasn't reached).
- **`stats`:** a snapshot, `{ level, values: { key: number } }`; a key the game hasn't had gets its English and its own name through `names`.
- **`build`:** the plan: `summary`, `mainStat`, `targets`.
- **`items`:** by `id` or exact `name`, with `kind`, `location`, `equipped`, `verdict` and a `spoiler` level.

`next` asks Claude to read back what was filed, to check new quests against open ones, to confirm a quest marked done, and notes new stat keys and filed spoilers.

## briefing

"Where was I?" for one playthrough (`playthroughId`, or `game`, or the one played most recently): the last session, the open quests (open, then waiting on the game) with their next step and last log line, the build plan and the latest stats with their change, what is equipped, and the player's other playthroughs. It never contains a spoiler.

## open_threads

The quests that are open or waiting on the game, each with its whole log. `reveal` is `none` unless the player asked for hints in this conversation; `hint` adds hints, `full` everything. With a `reveal`, `next` tells Claude to warn before reading them out.
