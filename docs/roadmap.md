---
hide:
  - toc
---

# Where questlog is going

questlog started on 2026-10-30, from a quest log, a build page and a mechanics page Claude kept in a Trilium wiki while Marcel played Lies of P. It is becoming the place Claude files a play session into and reads "where was I?" back from, for any game, without spoilers.

This page says what is planned and why, inside the [values](values.md), and what has shipped. Each step links its issue and the value it serves. Planned steps have no dates, only now, next or later; shipped steps carry the day they shipped.

## The idea behind all of it

Talking while you play is the interface; questlog keeps what is true for your playthrough, and shows only what you found.

<!-- roadmap -->

## Parked

- **A household or shared log**: two players following the same playthrough. Each log is its player's alone today ([V2](values.md#v2-your-log-is-yours-alone)); sharing would be an explicit choice, not a default.
- **Screenshots kept as files**: a shared screenshot is read and filed as text and numbers ([V3](values.md#v3-your-progress-your-words)); questlog doesn't store it.

## Decided against

- **A game database or a mirrored wiki**: it would be the spoiler source [V1](values.md#v1-no-spoilers-you-didnt-ask-for) rules out and copy other people's work ([V6](values.md#v6-your-state-not-the-internets), ADR 0002).
- **Statistics across players**: they would show one player's log to others ([V2](values.md#v2-your-log-is-yours-alone)).

## Keep it true

The timeline is rendered from [`docs/roadmap.yml`](https://github.com/gamepanion/gamepanion/blob/main/docs/roadmap.yml); on GitHub, read that file. Finish a step in the pull request that finishes it: set `status: done`, replace `when` with a `date`, add the link to its pull request, and move it to the top of the shipped entries. Change the file in the pull request that changes the plan.
