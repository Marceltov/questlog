# questlog

A quest log, build tracker and item list for the games you play. You talk to Claude while you play; questlog remembers where you are, and tells you what you left open when you pick the game up again.

Capture happens through a built-in MCP endpoint (`/mcp`), so there is nothing to fill in by hand: say "I just talked to Toma" or share a screenshot of your stat screen, and Claude files it. The web UI is for looking things up on your phone next to the console. Everything is spoiler-aware: questlog only shows you what you have already found.

Next.js and SQLite, one container, one file of data. Licensed AGPL-3.0-only.

> **Status:** design phase. Nothing runs yet. What questlog is and will stay is in [docs/values.md](docs/values.md); the first architectural decision is [ADR 0001](docs/adr/0001-ai-first-game-tracker-with-built-in-mcp.md).

## What it tracks

- **Games and playthroughs**: Lies of P, Elden Ring, any game; a new playthrough for NG+.
- **Quests**: each NPC thread you have found, a dated log of what you did, and a vague next step so you don't forget a started thread.
- **Build**: your stat plan and dated snapshots of your stats, taken from what you say or a screenshot.
- **Items**: weapons and parts you find, how they fit your build, and Claude's verdict with sources.
- **Sessions**: your own words from each play session, which everything above points back to.

## How it relates to freundebuch

questlog follows [freundebuch](https://github.com/Marceltov/freundebuch): the same stack, the same AI-first design (MCP first, every tool result tells Claude what to do next, the session transcript as its own record) and the same self-hosting promise.
