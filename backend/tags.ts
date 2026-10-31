// Tags (ADR 0014): free names a game's items, codex entries and quests carry across their groups ("fire" on a sword, a resistance pot
// and a boss), made up by Claude as they're needed. One tag per name in its norm form, so "Fire" files as the "fire" there is. Every
// tag shown comes from a row that came through the gate: the tags in use are counted over views, never read off tag_links alone.
import type { Kysely, Transaction } from "kysely";
import { newId, now } from "./db";
import type { Schema } from "./db/schema";
import { NotFoundError } from "./errors";
import { norm } from "./names";
import { seen } from "./spoilers";
import type { Player } from "./types";

type Db = Kysely<Schema> | Transaction<Schema>;

export const TAG_TARGETS = ["item", "codex", "quest"] as const;
export type TagTarget = (typeof TAG_TARGETS)[number];
const TABLES = { item: "items", codex: "codex", quest: "quests" } as const;

/** A tag's name as it is kept: trimmed, one space between words. */
export const tagName = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Gives one of the player's rows in `gameId` exactly the tags `names`, reusing the game's tags by their norm form. The names of the
 * tags it had to create. A tag no row carries any more goes (a trigger). */
export async function setTags(trx: Transaction<Schema>, p: Player, gameId: string, what: TagTarget, rowId: string, names: string[]): Promise<string[]> {
  const row = await seen(trx.selectFrom(TABLES[what]), p, TABLES[what], "full")
    .innerJoin("playthroughs", "playthroughs.id", `${TABLES[what]}.playthrough_id`)
    .select("playthroughs.game_id")
    .where(`${TABLES[what]}.id`, "=", rowId)
    .executeTakeFirst();
  if (!row || row.game_id !== gameId) throw new NotFoundError(`No ${what} with id ${rowId} in this game`);

  const wanted = new Map<string, string>();
  for (const n of names.map(tagName).filter(Boolean)) if (!wanted.has(norm(n))) wanted.set(norm(n), n);
  const existing = wanted.size
    ? await seen(trx.selectFrom("tags"), p, "tags").select(["id", "norm"]).where("game_id", "=", gameId).where("norm", "in", [...wanted.keys()]).execute()
    : [];
  const ids = new Map(existing.map((t) => [t.norm, t.id]));
  const created: string[] = [];
  for (const [key, name] of wanted) {
    if (ids.has(key)) continue;
    const id = newId();
    await trx.insertInto("tags").values({ id, player_id: p.id, game_id: gameId, name, norm: key, created_at: now() }).execute();
    ids.set(key, id);
    created.push(name);
  }

  await seen(trx.deleteFrom("tag_links"), p, "tag_links")
    .where("what", "=", what)
    .where("row_id", "=", rowId)
    .where("tag_id", "not in", ids.size ? [...ids.values()] : [""])
    .execute();
  if (ids.size)
    await trx
      .insertInto("tag_links")
      .values([...ids.values()].map((tag_id) => ({ tag_id, player_id: p.id, what, row_id: rowId })))
      .onConflict((oc) => oc.doNothing())
      .execute();
  return created;
}

/** The names of the tags each of `rowIds` carries, by name. Rows without tags are missing from the map. */
export async function tagsOf(d: Db, p: Player, what: TagTarget, rowIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!rowIds.length) return out;
  const rows = await seen(d.selectFrom("tag_links"), p, "tag_links")
    .innerJoin("tags", "tags.id", "tag_links.tag_id")
    .select(["tag_links.row_id", "tags.name"])
    .where("tag_links.what", "=", what)
    .where("tag_links.row_id", "in", rowIds)
    .orderBy("tags.norm")
    .execute();
  for (const r of rows) out.set(r.row_id, [...(out.get(r.row_id) ?? []), r.name]);
  return out;
}

/** The tags on `rows` with how many carry each, most used first, then by name. Only ever over rows that came through the gate. */
export function tagsInUse(rows: { tags: string[] }[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || norm(a.name).localeCompare(norm(b.name)));
}
