// Goals (ADR 0009): what the player wants to get to in a playthrough, kept apart from what happened (sessions, snapshots). Ranked: the
// first open one is what comes next. A stat or level goal is reached on its own when a snapshot gets there; an item or note goal when
// the player says so. Nothing is deleted when plans change: a goal replaced or given up is dropped and stays, so the plan has a history.
// A goal Claude or a guide suggested is marked so until the player agrees (values V4), and one that names what the player hasn't
// reached carries a spoiler level like a quest entry (values V1).
import type { Kysely, Transaction } from "kysely";
import { db, newId, now } from "./db";
import type { Schema } from "./db/schema";
import { InvalidInputError, NotFoundError } from "./errors";
import { getPlaythrough, statNames } from "./games";
import { norm } from "./names";
import { seen } from "./spoilers";
import { GOAL_STATUSES, type GoalKind, type GoalStatus, type Player, type SpoilerLevel, type StatName } from "./types";
import { itemPath, sessionPath } from "./urls";

type Db = Kysely<Schema> | Transaction<Schema>;

export type GoalView = {
  id: string;
  kind: GoalKind;
  /** A stat goal's stat, named as the game names it. */
  stat: StatName | null;
  /** A stat goal's value or a level goal's level. */
  target: number | null;
  /** Where the latest snapshot is, for a stat or level goal; null without one. */
  current: number | null;
  item: { id: string; name: string; url: string } | null;
  /** A note goal's goal, or why any goal was set. */
  text: string | null;
  /** 1 is first. */
  rank: number;
  status: GoalStatus;
  /** Suggested by Claude or a guide, and not agreed to by the player yet. */
  suggested: boolean;
  spoiler: SpoilerLevel;
  reachedOn: string | null;
  /** The session it was set in, when there is one. */
  sessionUrl: string | null;
};

export type GoalInput = {
  /** An existing goal, to change. */
  id?: string;
  kind?: GoalKind;
  stat?: string;
  target?: number;
  /** An item goal's item: its id, or its exact name in the playthrough. */
  item?: string;
  text?: string;
  suggested?: boolean;
  status?: GoalStatus;
  spoiler?: SpoilerLevel;
  rank?: number;
};

export type FiledGoal = { id: string; label: string; status: GoalStatus; suggested: boolean; created: boolean; spoiler: SpoilerLevel };

const ORDER: Record<GoalStatus, number> = { open: 0, reached: 1, dropped: 2 };

/** A short name for a goal, for reading back: "Vigor 20", "level 40", "Fire Axe: keep the blade", or the note. */
export const goalLabel = (g: Pick<GoalView, "kind" | "stat" | "target" | "item" | "text">): string =>
  g.kind === "stat"
    ? `${g.stat?.name ?? "?"} ${g.target}`
    : g.kind === "level"
      ? `level ${g.target}`
      : g.kind === "item"
        ? `${g.item?.name ?? "an item"}${g.text ? `: ${g.text}` : ""}`
        : (g.text ?? "");

/** The latest snapshot's level and values, through the gate. */
async function latest(d: Db, p: Player, playthroughId: string) {
  const row = await seen(d.selectFrom("stat_snapshots"), p, "stat_snapshots")
    .select(["level", "stats", "taken_on"])
    .where("playthrough_id", "=", playthroughId)
    .orderBy("taken_on", "desc")
    .orderBy("created_at", "desc")
    .executeTakeFirst();
  return row ? { level: row.level, values: JSON.parse(row.stats) as Record<string, number>, takenOn: row.taken_on } : null;
}

/** The goals of one of the player's playthroughs: open ones by rank (the player's before suggestions), then reached, then dropped. */
export async function goalsOf(p: Player, playthroughId: string, opts: { reveal?: SpoilerLevel; statuses?: readonly GoalStatus[] } = {}): Promise<GoalView[]> {
  const t = await getPlaythrough(p, playthroughId); // NotFoundError for another player's
  const d = await db();
  const rows = await seen(d.selectFrom("goals"), p, "goals", opts.reveal ?? "none")
    .selectAll()
    .where("playthrough_id", "=", playthroughId)
    .where("status", "in", [...(opts.statuses ?? GOAL_STATUSES)])
    .execute();
  // An item goal shows its item only as far as the item itself may be shown.
  const itemIds = rows.map((r) => r.item_id).filter((x): x is string => !!x);
  const items = itemIds.length
    ? await seen(d.selectFrom("items"), p, "items", opts.reveal ?? "none")
        .select(["id", "name"])
        .where("id", "in", itemIds)
        .execute()
    : [];
  const names = await statNames(p, t.game.id);
  const snap = await latest(d, p, playthroughId);
  return rows
    .map((r): GoalView => {
      const item = items.find((i) => i.id === r.item_id);
      const stat = r.stat ? (names.find((n) => n.key === r.stat) ?? { key: r.stat, name: r.stat, localName: null }) : null;
      return {
        id: r.id,
        kind: r.kind as GoalKind,
        stat,
        target: r.target,
        current: r.kind === "stat" && r.stat ? (snap?.values[r.stat] ?? null) : r.kind === "level" ? (snap?.level ?? null) : null,
        item: item ? { id: item.id, name: item.name, url: itemPath(playthroughId, item.id) } : null,
        text: r.text,
        rank: r.rank,
        status: r.status as GoalStatus,
        suggested: r.suggested === 1,
        spoiler: r.spoiler as SpoilerLevel,
        reachedOn: r.reached_on,
        sessionUrl: r.session_id ? sessionPath(r.session_id) : null,
      };
    })
    .sort(
      (a, b) =>
        ORDER[a.status] - ORDER[b.status] ||
        (a.status === "open" ? Number(a.suggested) - Number(b.suggested) || a.rank - b.rank : (b.reachedOn ?? "").localeCompare(a.reachedOn ?? "")),
    );
}

/** Marks the open stat and level goals the latest snapshot has got to as reached, on its day. Returns their ids. */
export async function reachGoals(trx: Transaction<Schema>, p: Player, playthroughId: string): Promise<string[]> {
  const snap = await latest(trx, p, playthroughId);
  if (!snap) return [];
  const open = await seen(trx.selectFrom("goals"), p, "goals", "full")
    .select(["id", "kind", "stat", "target"])
    .where("playthrough_id", "=", playthroughId)
    .where("status", "=", "open")
    .where("kind", "in", ["stat", "level"])
    .execute();
  const there = open.filter((g) => {
    if (g.target === null) return false;
    const value = g.kind === "level" ? snap.level : g.stat ? snap.values[g.stat] : undefined;
    return value !== undefined && value !== null && value >= g.target;
  });
  for (const g of there)
    await seen(trx.updateTable("goals"), p, "goals", "full")
      .set({ status: "reached", reached_on: snap.takenOn, updated_at: now() })
      .where("id", "=", g.id)
      .execute();
  return there.map((g) => g.id);
}

const nextRank = async (trx: Transaction<Schema>, p: Player, playthroughId: string) => {
  const r = await seen(trx.selectFrom("goals"), p, "goals", "full")
    .select((eb) => eb.fn.max("rank").as("rank"))
    .where("playthrough_id", "=", playthroughId)
    .executeTakeFirst();
  return Number(r?.rank ?? 0) + 1;
};

/**
 * Files `inputs` into a playthrough, as set in `sessionId`. A goal with an id is changed; a new stat or level goal replaces the open one
 * for the same stat (or the level) when its target differs (the old one is dropped and keeps its place in the history), and updates it
 * when the target is the same; a new item goal updates the open one for the same item.
 */
export async function writeGoals(
  trx: Transaction<Schema>,
  p: Player,
  t: { id: string; gameId: string },
  sessionId: string | null,
  inputs: GoalInput[],
): Promise<FiledGoal[]> {
  const out: FiledGoal[] = [];
  const at = now();
  const known = await statNames(p, t.gameId, trx);
  for (const g of inputs) {
    if (g.target !== undefined && !Number.isFinite(g.target)) throw new InvalidInputError("goals: target must be a number");
    const text = g.text?.trim() || undefined;
    if (g.id) {
      const row = await seen(trx.selectFrom("goals"), p, "goals", "full")
        .selectAll()
        .where("id", "=", g.id)
        .where("playthrough_id", "=", t.id)
        .executeTakeFirst();
      if (!row) throw new NotFoundError(`No goal with id ${g.id} in this playthrough`);
      const status = g.status ?? (row.status as GoalStatus);
      await seen(trx.updateTable("goals"), p, "goals", "full")
        .set({
          ...(g.target !== undefined ? { target: g.target } : {}),
          ...(text ? { text } : {}),
          ...(g.suggested !== undefined ? { suggested: g.suggested ? 1 : 0 } : {}),
          ...(g.spoiler ? { spoiler: g.spoiler } : {}),
          ...(g.rank !== undefined ? { rank: g.rank } : {}),
          status,
          reached_on: status === "reached" ? (row.reached_on ?? null) : null,
          updated_at: at,
        })
        .where("id", "=", g.id)
        .execute();
      out.push({
        id: g.id,
        label: await labelOf(trx, p, row.kind as GoalKind, row.stat, g.target ?? row.target, row.item_id, text ?? row.text, known),
        status,
        suggested: g.suggested ?? row.suggested === 1,
        created: false,
        spoiler: (g.spoiler ?? row.spoiler) as SpoilerLevel,
      });
      continue;
    }
    if (!g.kind) throw new InvalidInputError("goals: a new goal needs a kind (stat, level, item or note)");
    let stat: string | null = null;
    let itemId: string | null = null;
    if (g.kind === "stat") {
      stat = g.stat?.trim() || null;
      if (!stat || g.target === undefined) throw new InvalidInputError("goals: a stat goal needs stat (its key) and target");
      if (!known.some((n) => n.key === stat))
        throw new InvalidInputError(
          `goals: ${stat} isn't a stat of this game (it has ${known.map((n) => n.key).join(", ") || "none yet"}); file a snapshot with it first`,
        );
    } else if (g.kind === "level") {
      if (g.target === undefined) throw new InvalidInputError("goals: a level goal needs target");
    } else if (g.kind === "item") {
      const name = g.item?.trim();
      if (!name) throw new InvalidInputError("goals: an item goal needs item (its id or its exact name)");
      const found = await seen(trx.selectFrom("items"), p, "items", "full")
        .select("id")
        .where("playthrough_id", "=", t.id)
        .where((eb) => eb.or([eb("id", "=", name), eb("norm", "=", norm(name))]))
        .executeTakeFirst();
      if (!found) throw new NotFoundError(`goals: no item ${name} in this playthrough; file it with items first`);
      itemId = found.id;
    } else if (!text) throw new InvalidInputError("goals: a note goal needs text");

    // The open goal this one takes the place of.
    let same = seen(trx.selectFrom("goals"), p, "goals", "full")
      .selectAll()
      .where("playthrough_id", "=", t.id)
      .where("status", "=", "open")
      .where("kind", "=", g.kind);
    if (g.kind === "stat") same = same.where("stat", "=", stat);
    else if (g.kind === "item") same = same.where("item_id", "=", itemId);
    const before = g.kind === "note" ? undefined : await same.executeTakeFirst();
    const suggested = g.suggested ?? false;
    const spoiler = g.spoiler ?? "none";
    if (before && (g.kind === "item" || before.target === g.target)) {
      await seen(trx.updateTable("goals"), p, "goals", "full")
        .set({ ...(text ? { text } : {}), suggested: suggested ? 1 : 0, spoiler, ...(g.rank !== undefined ? { rank: g.rank } : {}), updated_at: at })
        .where("id", "=", before.id)
        .execute();
      out.push({
        id: before.id,
        label: await labelOf(trx, p, g.kind, stat, before.target, itemId, text ?? before.text, known),
        status: "open",
        suggested,
        created: false,
        spoiler,
      });
      continue;
    }
    if (before) await seen(trx.updateTable("goals"), p, "goals", "full").set({ status: "dropped", updated_at: at }).where("id", "=", before.id).execute();
    const id = newId();
    await trx
      .insertInto("goals")
      .values({
        id,
        player_id: p.id,
        playthrough_id: t.id,
        session_id: sessionId,
        kind: g.kind,
        stat,
        target: g.kind === "stat" || g.kind === "level" ? g.target! : null,
        item_id: itemId,
        text: text ?? null,
        rank: g.rank ?? before?.rank ?? (await nextRank(trx, p, t.id)),
        status: g.status ?? "open",
        suggested: suggested ? 1 : 0,
        spoiler,
        reached_on: null,
        created_at: at,
        updated_at: at,
      })
      .execute();
    out.push({
      id,
      label: await labelOf(trx, p, g.kind, stat, g.target ?? null, itemId, text ?? null, known),
      status: g.status ?? "open",
      suggested,
      created: true,
      spoiler,
    });
  }
  return out;
}

async function labelOf(
  trx: Transaction<Schema>,
  p: Player,
  kind: GoalKind,
  stat: string | null,
  target: number | null,
  itemId: string | null,
  text: string | null,
  known: StatName[],
) {
  const item = itemId ? await seen(trx.selectFrom("items"), p, "items", "full").select(["id", "name"]).where("id", "=", itemId).executeTakeFirst() : undefined;
  return goalLabel({
    kind,
    stat: stat ? (known.find((n) => n.key === stat) ?? { key: stat, name: stat, localName: null }) : null,
    target,
    item: item ? { ...item, url: "" } : null,
    text,
  });
}

/** Copies the open goals of `fromId` into `toId` (a new run of the same game, e.g. NG+), in their order. Item goals stay behind: items
 * belong to their playthrough. */
export async function carryGoals(trx: Transaction<Schema>, p: Player, fromId: string, toId: string, sessionId: string): Promise<number> {
  const open = await seen(trx.selectFrom("goals"), p, "goals", "full")
    .selectAll()
    .where("playthrough_id", "=", fromId)
    .where("status", "=", "open")
    .where("kind", "!=", "item")
    .orderBy("rank")
    .execute();
  const at = now();
  for (const [i, g] of open.entries())
    await trx
      .insertInto("goals")
      .values({ ...g, id: newId(), playthrough_id: toId, session_id: sessionId, rank: i + 1, reached_on: null, created_at: at, updated_at: at })
      .execute();
  return open.length;
}
