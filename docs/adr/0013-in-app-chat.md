---
status: accepted
date: 2026-10-31
decision-makers: Marcel Bruckner
---

# The in-app chat calls Claude from the server, with an API key

## Context and Problem Statement

questlog is AI-first with the AI in the client (ADR 0001): Claude, connected over MCP, does the understanding. But the player is often in the web app when something comes up: a number on a card is wrong, a quest log line names the wrong person, or they want to ask where they were. Switching to the Claude app for that, and telling Claude which row they mean, is the friction they want gone (#34). They also want to speak instead of type, while the game is still running.

## Considered Options

* **The server calls the Claude API with an API key, with the MCP tools, as the signed-in player** (chosen), as freundebuch does (its ADR 0006).
* **A separate service running the Claude Agent SDK on a Claude plan.** Anthropic's terms don't allow a Claude.ai login to power a product, and it is one more service.
* **Keep the web app read-only** and send the player to the Claude app. No cost, but the friction stays.

## Decision Outcome

Chosen option: the server calls the Claude API with an API key.

* `QUESTLOG_ANTHROPIC_API_KEY` turns the chat on; without it the app shows no chat button. `QUESTLOG_ANTHROPIC_MODEL` sets the model (default Claude Opus 5.5), with the API's server-side fallback on a refusal.
* The chat uses the tool table MCP uses (`backend/tools.ts`) and the MCP instructions, so it behaves like Claude over MCP: no spoilers, ask before filing a guess, follow `next`. Every tool call runs as the signed-in player through the domain layer, so the gate (`seen()`, values V1 and V2) holds unchanged.
* A button on every card (quest, log line, item, codex entry, goal, session, the build) opens the chat about that row: the server reads the row through the gate, as the page shows it, and gives it to Claude as data, so "that's wrong" goes to `correct` on the right row. A row that isn't the player's or isn't in the playthrough adds nothing.
* `record` takes no transcript in the chat: the server fills it in with the player's own messages since the last filing, verbatim (values V3).
* `POST /api/chat` takes only the web app's session cookie; scripts and Claude keep REST and MCP. The conversation lives on the device and arrives whole with each message; the server stores only what the tools file.
* Cost guards: at most 8 tool rounds per message and a daily message limit per player (`QUESTLOG_CHAT_DAILY_LIMIT`, default 100, counted in `chat_usage`).
* Speaking: `POST /api/chat/voice` sends the recording to a Whisper server the instance runs itself (`QUESTLOG_TRANSCRIBE_URL`, the OpenAI-compatible `/v1/audio/transcriptions`, such as speaches) and hands the words back to be sent as the message. The recording is never stored and never leaves the instance's servers. Without the URL the chat takes typing only.

### Consequences

* Good, because asking, filing and fixing work without leaving the app, from the row the player is looking at.
* Bad, because the instance owner pays per message, and the server now sends the player's log to the Claude API when the chat is used, as the Claude app already does over MCP.
