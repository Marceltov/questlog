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

export const PLAYTHROUGH_STATUSES = ["playing", "finished", "dropped"] as const;
export type PlaythroughStatus = (typeof PLAYTHROUGH_STATUSES)[number];

/** A stat the game has, as data (values V8): `key` is how snapshots name it, `name` the English name, `localName` the game's own. */
export type StatName = { key: string; name: string; localName: string | null };
