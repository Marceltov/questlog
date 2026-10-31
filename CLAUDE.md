# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

questlog: a spoiler-free quest log, build tracker and item list for the games you play, AI-first (capture happens through the built-in MCP endpoint). Next.js + SQLite, modelled on `Marceltov/freundebuch`.

## Commands

- `npm run dev` / `npm run build` / `npm start`
- `npm run typecheck` (next typegen + tsc), `npm run lint`, `npm run format` / `npm run format:check` (Prettier, 160 columns)
- `npm test` (vitest), `npx vitest run <file>` for one file. `backend/auth/oauth.test.ts` runs the whole OAuth sign-in over HTTP.
- `npm run generate` rewrites `openapi.json` from the route table (`backend/http/api.ts`); commit the result, CI fails on any difference.
- `docker build -t questlog .`
- Docs: `uvx --with mkdocs-material==9.7.7 --with 'mkdocs<2' --with mkdocs-static-i18n==1.3.1 mkdocs serve` (`build --strict` in CI); published to GitHub Pages from `main` at questlog.marceltov.de. German pages sit next to the English ones (`values.de.md`) and fall back to English when missing. The roadmap is data: `docs/roadmap.yml`, rendered as a timeline by `docs_hooks/roadmap.py`. The pull request that finishes or changes a step updates it (`status: done`, a `date`, the PR link).

## Architecture

- Three surfaces call the same domain layer in `backend/`: `/mcp` (`backend/mcp.ts`, tools in `backend/tools.ts`), `/api/v1` (route table in `backend/http/api.ts`) and the pages in `app/(app)`. The in-app chat (`backend/chat.ts`, `/api/chat`, ADR 0013) runs the same tools over the Claude API as the signed-in player. See `docs/internals/how-it-works.md`.
- Sign-in is Better Auth (`backend/auth/auth.ts`, ADR 0004 and 0006), its tables in `DATA_DIR/auth.sqlite`. A player is Better Auth's `user.id`, stored as `player_id` on every row of `questlog.sqlite`. `/mcp` takes only access tokens bound to `${PUBLIC_URL}/mcp`, `/api/v1` only those bound to `${PUBLIC_URL}/api/v1` (ADR 0007); pages only the session cookie.
- One gate: `seen()` in `backend/spoilers.ts`. Every query on a table of `questlog.sqlite` goes through it, look-ups for writes and counts included: it scopes rows to the player (V2) and hides spoiler levels the read didn't ask for (V1, ADR 0005). Gate tests use the two-player seed in `backend/testing/fixtures.ts`; a new read path adds assertions to `spoilers.test.ts` and `isolation.test.ts`.
- Migrations live in code (`backend/db/migrations.ts`). Never edit one that has shipped; add the next.
- Next.js is 16.x with breaking changes; check `node_modules/next/dist/docs/` before relying on remembered APIs. Better Auth is 1.7.x; check option names in `node_modules/better-auth` and `node_modules/@better-auth/*` before using them.

## Rules

- What questlog stands for is `docs/values.md`: changes are judged against it, and a review names the point it touches ("this breaks V1").
- Follows Marceltov/engineering-conventions; the rules here win where they differ.
- AI-native: MCP is the main interface. Every feature works over MCP first (tools, their descriptions, what `next` says); the REST API and the web UI follow.
- No spoilers: every read goes through `seen()`; nothing the player hasn't found is shown unless they asked for it. A briefing never asks.
- Code, identifiers, API, tool names/descriptions, logs and docs are English. The UI is English and German: every UI string is in `components/copy/en.ts` and `de.ts` (a string missing from one fails the typecheck), the sign-in mail's in `backend/auth/copy.ts`. German docs pages sit next to the English ones.
- Accessible: keyboard reachable with visible focus, no meaning in colour alone (the register's tabs use the Okabe-Ito colours and their names), a name for every control without text (the flags are named by their language), reduced motion respected.
- `backend/` is framework-free and the frontend imports it only through `backend/index.ts` (enforced by eslint).
- Env vars are `QUESTLOG_*`, except `PUBLIC_URL`, `DATA_DIR`, `PORT`, `TZ`. Keep `backend/config.ts`, `.env.example` and `docs/self-hosting/configuration.md` in step; `compose.yaml` reads `.env` whole (`env_file`), so a new setting doesn't touch it.
- Architectural decisions go to `docs/adr/NNNN-*.md` (MADR). Never commit superpowers artifacts (`.superpowers/`, specs, plans).
- `next dev` writes a "nextjs-agent-rules" block into `AGENTS.md`; it is git-ignored, don't commit it.
