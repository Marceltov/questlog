# What questlog stands for

questlog keeps track of where you are in the games you play: the quests you have started, your build and the items you found. You tell Claude while you play; when you come back, Claude tells you what you left open. This page says what questlog will stay, whoever runs it and whatever it grows into.

It is also the yardstick for every change: a contribution, from a person or an AI, is judged against these points, and a review names the one it touches ("this breaks V1"). Each point says what it rules out, so that it can be used that way.

## Lines never crossed

### V1. No spoilers you didn't ask for

questlog shows you only what you have already found. Every quest, item and note has a spoiler level, and one function decides what you see. A list of what you might have missed exists only when you ask for it, behind a warning, and never in a briefing, a reminder or a tool result you didn't ask for.

**Rules out:** listing quests, items, bosses or areas you haven't reached; "next step" hints that name a boss, an outcome or a story event; a completion percentage that reveals how much is left; reads that skip the spoiler check.

### V2. Your log is yours alone

Everyone who signs in has their own games, playthroughs and progress. Nobody else on the same instance sees them: not in a list, a count, a briefing or anything Claude says to them.

**Rules out:** shared or household logs by default, an admin view into other players' logs, leaderboards or statistics across players, reads that aren't scoped to the signed-in player.

### V3. Your progress, your words

What you tell Claude is kept as your words: each play session keeps its transcript, next to the quest entries, stat snapshots and items filed from it. A screenshot you share is kept only until Claude has read it: then only what it shows stays, as text and numbers.

**Rules out:** keeping screenshots after they are read, a summary in place of what you said, progress Claude invented ("probably did X").

### V4. You decide what is filed

Claude files what you tell it and asks when it isn't sure: which quest you mean, whether you finished something or only started it, which choice you made. A guess never becomes a log entry on its own.

**Rules out:** filing in the background without you, marking a quest done from a guess, merging quests or items without asking.

## What you can rely on

### V5. Claude first

You talk, Claude files. Everything works over MCP first, and every tool result tells Claude what to do next; the REST API and the web app follow. The web app is for looking things up on the phone next to the screen.

**Rules out:** a feature only the web app has, an MCP tool that lags behind the API, forms as the main way to capture.

### V6. Your state, not the internet's

questlog keeps what is true for *your* playthrough: what you found, did and decided. Knowledge about the game (wikis, guides, builds) stays where it is. questlog may look up a page about something you have found, when you or Claude ask, and keeps the facts it needs (an item's scaling, say) with a link to the page; it never mirrors a source.

**Rules out:** shipping a game database, crawling or mirroring a wiki, keeping a source's text instead of the facts and a link, looking up what you haven't found yet, presenting a guide's claim as your progress.

### V7. Self-hosting has everything

questlog runs as one container on your own server, with one SQLite file. Every feature is there and nothing calls home. The code is AGPL-3.0: anyone may run it, and a changed version run as a service stays open.

**Rules out:** features only a hosted version has, telemetry, analytics or third-party scripts, a storage format only questlog can read.

### V8. Any game, any language

questlog is not built for one game. Stats, item types and quest states are data, not code, so a new game needs no release. The UI is English first, and German too; the game's own language (German stat names, say) is kept next to the English one.

**Rules out:** game-specific tables or code paths, hard-coded stat lists, a UI only in one language.

## Changing this page

The points keep their numbers, so that reviews and issues citing them stay right. A change to this page needs the maintainer's approval and says why in its pull request; a change that weakens V1 to V4 is a change to what questlog is.
