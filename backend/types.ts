// The vocabulary the backend shares. Strings here are what is stored in the database and what the tools accept; the arrays let the
// backend and the tool schemas check them at run time.

/** Who is asking: Better Auth's user id, checked on every surface (values V2). Every read is scoped to it. */
export type Player = { id: string };

/**
 * How much a row gives away (values V1). `none`: the player found it or told it. `hint`: a nudge that may name a place or a person the
 * player hasn't reached, but no outcome. `full`: names a boss, an outcome or a story event. A read shows `none` unless the player asked
 * for more (spoilers.ts).
 */
export const SPOILER_LEVELS = ["none", "hint", "full"] as const;
export type SpoilerLevel = (typeof SPOILER_LEVELS)[number];

/**
 * Where a quest stands. `open`: started and waiting on the player. `blocked`: started, waiting on the game (story progress, a boss
 * first). `done`, `failed` and `dropped` close it.
 */
export const QUEST_STATUSES = ["open", "blocked", "done", "failed", "dropped"] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];
export const OPEN_STATUSES: readonly QuestStatus[] = ["open", "blocked"];

/** A quest log line: `log` is what happened, `next` the next step (vague, unless the player asked otherwise), `decision` a choice made. */
export const ENTRY_KINDS = ["log", "next", "decision"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/**
 * A long-term goal of a playthrough (ADR 0009), apart from what happened. `stat`: a stat to a value; `level`: a character level; `item`:
 * something to do with an item (keep a blade for a handle); `note`: anything else (stay under 60 % load).
 */
export const GOAL_KINDS = ["stat", "level", "item", "note"] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

/** `open`: still to do. `reached`: done; a stat or level goal gets there on its own when a snapshot does. `dropped`: given up or replaced. */
export const GOAL_STATUSES = ["open", "reached", "dropped"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/** What the codex keeps (ADR 0010): the bosses, enemies, NPCs and places the player met. */
export const CODEX_KINDS = ["boss", "enemy", "npc", "place"] as const;
export type CodexKind = (typeof CODEX_KINDS)[number];

/** `met`: seen, met, reached. `beaten`: a boss or enemy defeated. `gone`: an NPC dead or left, a boss skipped, a place shut. */
export const CODEX_STATUSES = ["met", "beaten", "gone"] as const;
export type CodexStatus = (typeof CODEX_STATUSES)[number];

/** The kinds the inventory groups by, in this order; an item's kind is free text in the game's terms, and anything else goes last. */
export const ITEM_KINDS = ["weapon", "blade", "handle", "armour", "amulet", "consumable", "material", "collectible", "key"] as const;

/** An item's numbers as the game shows them, by the game's names: { "Physical ATK": 119, "Technique": "C" }. */
export type Attributes = Record<string, string | number>;

export const PLAYTHROUGH_STATUSES = ["playing", "finished", "dropped"] as const;
export type PlaythroughStatus = (typeof PLAYTHROUGH_STATUSES)[number];

/** A stat the game has, as data (values V8): `key` is how snapshots name it, `name` the English name, `localName` the game's own. */
export type StatName = { key: string; name: string; localName: string | null };

/**
 * A page outside questlog (ADR 0008): one the player trusts for a game, or one an item's facts come from. questlog never fetches it;
 * Claude reads it in the conversation and files `facts` (never the page's text) with the link. `on` is the day it was added.
 */
export type Source = { url: string; title: string | null; facts: string | null; on: string | null };
export type SourceInput = { url: string; title?: string; facts?: string };
