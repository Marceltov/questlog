---
status: accepted
date: 2026-10-30
decision-makers: Marcel Bruckner
---

# questlog is an AI-first game tracker with a built-in MCP endpoint, on Next.js and SQLite

## Context and Problem Statement

Marcel plays long Soulslikes (Lies of P on the Switch 2, earlier Dark Souls, Elden Ring, Sekiro) and loses track of the threads he started: an NPC waiting for an item, a choice he still has to make, which weapon part he kept for later. Playing Lies of P he kept this in his Trilium LLM wiki: a quest log page, a build page and a mechanics page, written by Claude while he talked. It worked, but each update rewrote a whole page, needed a write lock, and "which quests are still open?" was a read of free text, not a query. He wants the same experience, talking to Claude while playing, backed by a tool built for it.

## Decision Drivers

* Capture is by talking to Claude (and sharing screenshots), never by forms.
* Structured questions ("what is still open?", "how did my Technique grow?", "does this weapon fit my build?") must be answered reliably.
* No spoilers: the tool must never show what the player hasn't found (values V1).
* Works for any game, not just Lies of P (V8).
* Each player's log is theirs alone, enforced by the server (V2).
* One small thing to run in the homelab, with one data volume.

## Considered Options

* **Keep it in Trilium.** Already works and is linked with the rest of the wiki. But every change rewrites a page, quest status is free text, and the spoiler rule is a convention the assistant has to remember.
* **Add games to freundebuch.** Same stack and sign-in, nothing new to run. But freundebuch is about the people in a household's life; a quest log would blur what it stands for.
* **An existing tracker** (Notion templates, spreadsheet trackers, game-specific checklist sites). Built around checklists of everything in the game, which is the opposite of spoiler-free, and none is reachable by Claude in a structured way.
* **Build our own, AI-first, modelled on freundebuch.** (chosen)

## Decision Outcome

Chosen option: "Build our own, AI-first, modelled on freundebuch", because it keeps the way of working that already proved itself (talking while playing), turns progress into data, and makes the spoiler rule a property of the query layer.

* **Capture through the built-in MCP endpoint** (`POST /mcp`), added as a custom connector in claude.ai.
* **Stack and structure from freundebuch:** one Next.js app (standalone output, one Docker image), SQLite (better-sqlite3, kysely) on one volume, a framework-free `backend/` behind three surfaces (MCP, REST `/api/v1`, pages), sign-in through OIDC (authentik) and its own OAuth server for claude.ai. `next` and the MCP SDK pinned exactly.
* **Patterns from freundebuch's ADRs:** every tool result carries `next` (freundebuch ADR 0010); a play **session** is its own record holding the transcript, and everything filed from it points to it (ADR 0015); a shared screenshot is read, filed as text and deleted (ADR 0014).
* **Spoiler gate:** every quest, item and note has a spoiler level; one function decides what a read returns, like freundebuch's `visible()`. "Did I miss anything?" is its own tool and needs an explicit spoiler opt-in.
* **Language:** code, API, tool names and docs in English; the UI in English first, with room for other languages. Game terms keep their localized names next to the English ones.
* **One log per player, not per household** (decided by Marcel, 2026-10-30): everyone who can sign in has their own games, playthroughs and state, and nobody sees another player's log. This differs from freundebuch, where a household shares one book. Every read is scoped to the signed-in player, in the same query layer as the spoiler gate.
* **Sign-in through any OIDC provider:** authentik first, as in freundebuch, but configured as a generic OpenID Connect client so another provider can be used later without code changes.

### Domain (first sketch)

| Record | Holds |
| --- | --- |
| Game | Title, platform; the stat names and item kinds the game uses, as data |
| Playthrough | One run of a game (NG, NG+), language of the game |
| Session | The transcript of one play session; everything below points to the session it came from |
| Quest | NPC or name, where it starts, status, dated log entries, a vague next step, spoiler level |
| Build | The plan (main stat, targets) and dated stat snapshots |
| Item | Weapon or part, where and when found, scaling, equipped or not, Claude's verdict with sources |

### MCP tools (first sketch)

* `record`: file one session and split it into quest entries, stat snapshots, items and decisions.
* `briefing`: "where was I?" for a playthrough: open quests, current build, the last session.
* `open_threads`: quests that are started and waiting on the player.
* `item`: look up an item the player has, or compare a new one with the build.
* `missed`: what the player may have missed; only with an explicit spoiler opt-in.
* `lookup`: fetch facts about an item or quest the player has from a source such as a wiki ([ADR 0002](0002-on-demand-lookups-not-crawling.md)).
* `correct`: fix or remove anything filed.

### Consequences

* Good, because "what is open?" and "how did my stats grow?" become queries, not readings of a page.
* Good, because spoiler safety is enforced by the server, not remembered by the assistant.
* Good, because freundebuch's code and conventions give a working start.
* Bad, because it is a second app to maintain next to freundebuch. Sign-in and OAuth come from a shared library ([ADR 0003](0003-sign-in-through-a-typescript-mcp-login-oauth.md)); the rest of the plumbing is copied.
* Bad, because what Claude finds on the web about items and quests may be wrong; questlog keeps the sources so the player can check.

### Later

* Import the existing Trilium pages (Lies of P quest log and build) as the first playthrough, once questlog can record them (decided by Marcel, 2026-10-30).
