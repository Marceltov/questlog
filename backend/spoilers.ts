// The one gate for every read (values V1 and V2). A row reaches a player only when it is theirs, and, in a table whose rows carry a
// spoiler level, only when the level is one they asked for. Every query on a table of the schema goes through `seen`, counts and
// look-ups for a write included, so neither rule can drift between call sites. What is built from rows (a briefing, a tool's `next`, a
// page) is built only from rows that came through it.
import { sql, type Expression, type SqlBool } from "kysely";
import type { Schema } from "./db/schema";
import { SPOILER_LEVELS, type Player, type SpoilerLevel } from "./types";

/** The tables whose rows carry a spoiler level. */
export const SPOILER_TABLES = ["quests", "quest_entries", "items", "goals", "codex"] as const satisfies readonly (keyof Schema)[];
export type SpoilerTable = (typeof SPOILER_TABLES)[number];
const hasSpoiler = (t: keyof Schema): t is SpoilerTable => (SPOILER_TABLES as readonly string[]).includes(t);

/** The levels a read that asked for `reveal` may show: `none` shows only what the player found, `hint` adds hints, `full` everything. */
export const shown = (reveal: SpoilerLevel): SpoilerLevel[] => SPOILER_LEVELS.slice(0, SPOILER_LEVELS.indexOf(reveal) + 1);

/**
 * Narrows a query on `table` to the rows `player` may see: their own (`table.player_id = player`) and, where rows carry a spoiler
 * level, no more than `reveal` gives away. `reveal` is `none` unless the player asked for more in this request; a briefing never does.
 */
export function seen<T extends { where(e: Expression<SqlBool>): T }>(qb: T, player: Player, table: keyof Schema, reveal: SpoilerLevel = "none"): T {
  const own = sql<SqlBool>`${sql.ref(`${table}.player_id`)} = ${player.id}`;
  if (!hasSpoiler(table)) return qb.where(own);
  const levels = sql.join(shown(reveal).map((l) => sql.lit(l)));
  return qb.where(sql<SqlBool>`(${own} and ${sql.ref(`${table}.spoiler`)} in (${levels}))`);
}
