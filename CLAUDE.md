# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

questlog: a spoiler-free quest log, build tracker and item list for the games you play, AI-first (capture happens through the built-in MCP endpoint). Next.js + SQLite, modelled on `Marceltov/freundebuch`.

## Status

Design phase: there is no code yet. The design is in `docs/adr/` (0001 the app, 0002 lookups, 0003 sign-in). Sign-in comes from the TypeScript package in `Marceltov/mcp-login-oauth`, which is built first.

## Rules

- What questlog stands for is `docs/values.md`: changes are judged against it, and a review names the point it touches ("this breaks V1").
- AI-native: MCP is the main interface. Every feature works over MCP first; the REST API and the web UI follow.
- No spoilers: every read goes through one spoiler check; nothing the player hasn't found is shown unless they asked for it.
- Code, identifiers, API, tool names/descriptions, logs, docs and the UI are English.
- Architectural decisions go to `docs/adr/NNNN-*.md` (MADR). Never commit superpowers artifacts (`.superpowers/`, specs, plans).
- When building, follow freundebuch's structure and conventions (its `CLAUDE.md` and `docs/adr/`) unless an ADR here says otherwise.
