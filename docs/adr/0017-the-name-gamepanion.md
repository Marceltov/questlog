---
status: accepted
date: 2026-11-01
decision-makers: Marcel Bruckner
---

# The product is called Gamepanion

## Context and Problem Statement

The project started as questlog, under a personal account and a homelab address. Before it is sold per game (#48) it needs a name it can keep: one with a free domain, no clashing trademark, and a meaning that says what sets it apart. "questlog" fails all three: `questlog.app`, `.gg`, `.io`, `.de` and `.com` are taken, live products in the same space use the name, and "log" puts it next to the game trackers (Gamelog, Backloggd) whose job is a different one: which games you play, not where you are inside one.

## Considered Options

* **Gamepanion**: game and companion, one coined word.
* Savequill, Playscribe, Talkquest: free, but bookish or hard to say.
* Game Familiar: a fitting picture (the companion that talks), but "FAMILIAR" is registered for software and SaaS in the EU, Germany and internationally.
* Keeping questlog.

## Decision Outcome

Chosen: **Gamepanion**, because what sets it apart is the companion you talk to while you play, and the word is free: `gamepanion.app`, the GitHub name, and no trademark in TMview (EUIPO, DPMA, WIPO) in any class.

* The repository is `gamepanion/gamepanion`, the image `ghcr.io/gamepanion/gamepanion`, the app `https://gamepanion.app`.
* Everything inside says Gamepanion, with no compatibility for the old name, since no other instance exists: copy, mails, the MCP server, `GAMEPANION_*` settings, `gamepanion.sqlite`.
* German copy keeps "Questlog" where it is the common noun ("dein Questlog").
* The ADRs before this one keep "questlog" as written: they record decisions made under that name.

### Consequences

* Good, because the name, domain, org and image are one word everywhere.
* Bad, because the server's `.env`, its data file and the claude.ai connector change once, together with the domain.
