// Fixing what was filed: a misspelt game, a quest marked done too early, a stat read wrong off a screenshot, an item filed twice. Each
// change names one row by its id and either sets some of its fields or removes it; all changes of one call run in one transaction.
// Look-ups go through the gate like every other query (spoilers.ts), so another player's id is simply not found (values V2). Nothing is
// merged unless the call says so with mergeInto, which Claude passes only after the player agreed (values V4).
import type { Transaction } from "kysely";
import { db, now } from "./db";
import type { Schema } from "./db/schema";
import { AmbiguousError, InvalidInputError, NotFoundError } from "./errors";
import { today } from "./dates";
import { fileItemKind, setItemKinds, statNames, type ItemKindInput } from "./games";
import { writeUses, type AgainstInput } from "./codex";
import { goalLabel, reachGoals } from "./goals";
import { norm } from "./names";
import { mergeSources, parseSources } from "./sources";
import { seen } from "./spoilers";
import {
  CODEX_STATUSES,
  ENTRY_KINDS,
  GOAL_STATUSES,
  PLAYTHROUGH_STATUSES,
  QUEST_STATUSES,
  SPOILER_LEVELS,
  type Attributes,
  type CodexStatus,
  type EntryKind,
  type GoalKind,
  type GoalStatus,
  type Player,
  type PlaythroughStatus,
  type QuestStatus,
  type SpoilerLevel,
} from "./types";
import type { SourceInput } from "./types";
import { codexPath, itemPath, playthroughPath, questPath, sessionPath } from "./urls";

// The new list replaces the old one; a link that stays keeps the day it was first added.
const replaceSources = (before: string, next: SourceInput[] | undefined) => {
  if (!next) return undefined;
  const old = parseSources(before);
  return JSON.stringify(mergeSources([], next, today()).map((s) => ({ ...s, on: old.find((o) => o.url === s.url)?.on ?? s.on })));
};

/** What a correction can name. */
export const TARGETS = ["game", "playthrough", "session", "quest", "entry", "snapshot", "item", "goal", "codex"] as const;
export type Target = (typeof TARGETS)[number];

/** One change: the row (`what`, `id`), and either `remove` or the fields to set. A nullable field set to null is cleared. */
export type Correction = {
  what: Target;
  id: string;
  remove?: boolean;
  /** A quest only: move its entries to this quest and remove it. */
  mergeInto?: string;
  title?: string;
  platform?: string | null;
  label?: string;
  language?: string | null;
  status?: string;
  summary?: string;
  playedOn?: string;
  name?: string;
  localName?: string | null;
  giver?: string | null;
  location?: string | null;
  kind?: string | null;
  text?: string;
  spoiler?: SpoilerLevel;
  level?: number | null;
  values?: Record<string, number>;
  equipped?: boolean;
  verdict?: string | null;
  /** A game's or an item's sources, all of them: a link left out is dropped. */
  sources?: SourceInput[];
  /** A playthrough's character. */
  characterName?: string | null;
  characterClass?: string | null;
  characterLocalClass?: string | null;
  /** A goal's value (stat) or level. */
  target?: number;
  /** A goal: false once the player agreed to a suggestion. */
  suggested?: boolean;
  /** A goal's place: 1 is first. */
  rank?: number;
  /** An item's count; null when it isn't counted. */
  quantity?: number | null;
  /** An item's numbers, all of them: a key left out is dropped. */
  attributes?: Attributes;
  /** What an item is good or bad against, all of it: a link left out is dropped. */
  against?: AgainstInput[];
  /** A game's inventory groups, all of them in the player's order. */
  itemKinds?: ItemKindInput[];
  /** A codex entry's. */
  attempts?: number | null;
  weaknesses?: string[];
  resistances?: string[];
  strategy?: string | null;
  /** The player's own notes, all of them (ADR 0011): every target but an entry. */
  notes?: string | null;
  /** What a game, quest, item or codex entry is. */
  description?: string | null;
};

// The fields each target takes; any other field in a change is a refusal, so a typo doesn't pass silently.
const FIELDS: Record<Target, readonly (keyof Correction)[]> = {
  game: ["title", "platform", "description", "notes", "sources", "itemKinds"],
  playthrough: ["label", "language", "status", "characterName", "characterClass", "characterLocalClass", "notes"],
  session: ["summary", "playedOn", "notes"],
  quest: ["name", "localName", "giver", "location", "status", "description", "notes"],
  entry: ["kind", "text", "spoiler"],
  snapshot: ["level", "values", "playedOn", "notes"],
  item: ["name", "localName", "kind", "location", "equipped", "verdict", "spoiler", "sources", "quantity", "attributes", "against", "description", "notes"],
  codex: ["name", "localName", "location", "status", "attempts", "weaknesses", "resistances", "strategy", "description", "notes", "spoiler", "sources"],
  goal: ["target", "text", "status", "suggested", "rank", "spoiler", "notes"],
};

export type Corrected = {
  what: Target;
  id: string;
  /** What the row is called now (its title, name or day), for reading back. */
  name: string;
  /** The fields that were set; empty when the row was removed. */
  changed: string[];
  removed: boolean;
  /** The quest a merged quest's entries moved to. */
  mergedInto: { id: string; name: string } | null;
  /** The playthrough the row belongs to, for links and for reading back. */
  playthroughId: string | null;
  /** The row's page, or its playthrough's when it has none of its own; null for a removed playthrough or game. */
  url: string | null;
};

type Trx = Transaction<Schema>;

const text = (field: string, v: string | undefined) => {
  const t = v?.trim();
  if (v !== undefined && !t) throw new InvalidInputError(`${field}: can't be empty`);
  return t;
};
const nullable = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
const oneOf = <T extends string>(field: string, v: string | undefined, allowed: readonly T[]): T | undefined => {
  if (v !== undefined && !allowed.includes(v as T)) throw new InvalidInputError(`${field}: one of ${allowed.join(", ")}`);
  return v as T | undefined;
};
const count = (field: string, v: number | null | undefined) => {
  if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 0)) throw new InvalidInputError(`${field}: a count, 0 or more`);
  return v;
};
const strings = (v: string[] | undefined) => (v === undefined ? undefined : JSON.stringify(v.map((x) => x.trim()).filter(Boolean)));
// Only the fields that were given, so an update leaves the others as they are.
const given = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/** Applies `changes` as `p`, in order and all or none. */
export async function correct(p: Player, changes: Correction[]): Promise<Corrected[]> {
  if (!changes.length) throw new InvalidInputError("changes: name at least one row to fix or remove");
  for (const c of changes) {
    const extra = Object.keys(c).filter((k) => !["what", "id", "remove", "mergeInto", ...FIELDS[c.what]].includes(k) && c[k as keyof Correction] !== undefined);
    if (extra.length) throw new InvalidInputError(`${c.what} ${c.id}: ${extra.join(", ")} can't be set on a ${c.what} (it takes ${FIELDS[c.what].join(", ")})`);
    if (c.mergeInto !== undefined && c.what !== "quest") throw new InvalidInputError(`${c.what} ${c.id}: only a quest can be merged`);
    const sets = FIELDS[c.what].some((f) => c[f] !== undefined);
    if ((c.remove || c.mergeInto) && sets) throw new InvalidInputError(`${c.what} ${c.id}: remove or merge it, or set fields, not both`);
    if (!c.remove && !c.mergeInto && !sets) throw new InvalidInputError(`${c.what} ${c.id}: nothing to change`);
  }
  const d = await db();
  return d.transaction().execute(async (trx) => {
    const out: Corrected[] = [];
    for (const c of changes) out.push(await apply(trx, p, c));
    return out;
  });
}

function apply(trx: Trx, p: Player, c: Correction): Promise<Corrected> {
  switch (c.what) {
    case "game":
      return game(trx, p, c);
    case "playthrough":
      return playthrough(trx, p, c);
    case "session":
      return session(trx, p, c);
    case "quest":
      return quest(trx, p, c);
    case "entry":
      return entry(trx, p, c);
    case "snapshot":
      return snapshot(trx, p, c);
    case "item":
      return item(trx, p, c);
    case "goal":
      return goal(trx, p, c);
    case "codex":
      return codex(trx, p, c);
  }
}

const done = (c: Correction, name: string, playthroughId: string | null, url: string | null, mergedInto: Corrected["mergedInto"] = null): Corrected => ({
  what: c.what,
  id: c.id,
  name,
  changed: c.remove || c.mergeInto ? [] : FIELDS[c.what].filter((f) => c[f] !== undefined),
  removed: !!(c.remove || c.mergeInto),
  mergedInto,
  playthroughId,
  url,
});

async function game(trx: Trx, p: Player, c: Correction): Promise<Corrected> {
  const row = await seen(trx.selectFrom("games"), p, "games").select(["id", "title", "sources"]).where("id", "=", c.id).executeTakeFirst();
  if (!row) throw new NotFoundError(`No game with id ${c.id}`);
  if (c.remove) {
    // Its playthroughs go with it, and with them everything filed in them.
    await seen(trx.deleteFrom("games"), p, "games").where("id", "=", c.id).execute();
    return done(c, row.title, null, null);
  }
  const title = text("title", c.title);
  if (title) {
    const clash = await seen(trx.selectFrom("games"), p, "games").select("id").where("norm", "=", norm(title)).where("id", "!=", c.id).executeTakeFirst();
    if (clash)
      throw new AmbiguousError(`The player already has a game called ${title} (id ${clash.id}). questlog doesn't merge games: ask the player what they want`);
  }
  const set = given({
    title,
    norm: title && norm(title),
    platform: nullable(c.platform),
    description: nullable(c.description),
    notes: nullable(c.notes),
    sources: replaceSources(row.sources, c.sources),
  });
  if (Object.keys(set).length) await seen(trx.updateTable("games"), p, "games").set(set).where("id", "=", c.id).execute();
  if (c.itemKinds) await setItemKinds(trx, p, c.id, c.itemKinds, "replace");
  return done(c, title ?? row.title, null, null);
}

async function playthrough(trx: Trx, p: Player, c: Correction): Promise<Corrected> {
  const row = await seen(trx.selectFrom("playthroughs"), p, "playthroughs").select(["id", "label", "game_id"]).where("id", "=", c.id).executeTakeFirst();
  if (!row) throw new NotFoundError(`No playthrough with id ${c.id}`);
  if (c.remove) {
    await seen(trx.deleteFrom("playthroughs"), p, "playthroughs").where("id", "=", c.id).execute();
    return done(c, row.label, null, null);
  }
  const label = text("label", c.label);
  if (label) {
    const clash = await seen(trx.selectFrom("playthroughs"), p, "playthroughs")
      .select(["id", "label"])
      .where("game_id", "=", row.game_id)
      .where("id", "!=", c.id)
      .execute();
    const same = clash.find((t) => norm(t.label) === norm(label));
    if (same) throw new AmbiguousError(`This game already has a playthrough called ${same.label} (id ${same.id}): ask the player which label to use`);
  }
  const status = oneOf<PlaythroughStatus>("status", c.status, PLAYTHROUGH_STATUSES);
  await seen(trx.updateTable("playthroughs"), p, "playthroughs")
    .set(
      given({
        label,
        status,
        language: nullable(c.language),
        character_name: nullable(c.characterName),
        character_class: nullable(c.characterClass),
        character_local_class: nullable(c.characterLocalClass),
        notes: nullable(c.notes),
      }),
    )
    .where("id", "=", c.id)
    .execute();
  return done(c, label ?? row.label, c.id, playthroughPath(c.id));
}

// The day a playthrough was last played is the latest of its sessions; a session moved or removed can change it.
async function relast(trx: Trx, p: Player, playthroughId: string) {
  const latest = await seen(trx.selectFrom("sessions"), p, "sessions")
    .select((eb) => eb.fn.max("played_on").as("day"))
    .where("playthrough_id", "=", playthroughId)
    .executeTakeFirst();
  await seen(trx.updateTable("playthroughs"), p, "playthroughs")
    .set({ last_played_on: (latest?.day as string | null | undefined) ?? null })
    .where("id", "=", playthroughId)
    .execute();
}

async function session(trx: Trx, p: Player, c: Correction): Promise<Corrected> {
  const row = await seen(trx.selectFrom("sessions"), p, "sessions").select(["id", "played_on", "playthrough_id"]).where("id", "=", c.id).executeTakeFirst();
  if (!row) throw new NotFoundError(`No session with id ${c.id}`);
  if (c.remove) {
    // What was written in it goes with it: its log entries and its stat snapshot. Quests and items it started stay, without a session.
    await seen(trx.deleteFrom("quest_entries"), p, "quest_entries", "full").where("session_id", "=", c.id).execute();
    await seen(trx.deleteFrom("stat_snapshots"), p, "stat_snapshots").where("session_id", "=", c.id).execute();
    await seen(trx.deleteFrom("sessions"), p, "sessions").where("id", "=", c.id).execute();
    await relast(trx, p, row.playthrough_id);
    return done(c, row.played_on, row.playthrough_id, playthroughPath(row.playthrough_id));
  }
  const summary = text("summary", c.summary);
  await seen(trx.updateTable("sessions"), p, "sessions")
    .set(given({ summary, played_on: c.playedOn, notes: nullable(c.notes) }))
    .where("id", "=", c.id)
    .execute();
  if (c.playedOn) {
    // A snapshot is dated by its session.
    await seen(trx.updateTable("stat_snapshots"), p, "stat_snapshots").set({ taken_on: c.playedOn }).where("session_id", "=", c.id).execute();
    await relast(trx, p, row.playthrough_id);
  }
  return done(c, c.playedOn ?? row.played_on, row.playthrough_id, sessionPath(c.id));
}

async function quest(trx: Trx, p: Player, c: Correction): Promise<Corrected> {
  const find = (id: string) =>
    seen(trx.selectFrom("quests"), p, "quests", "full").select(["id", "name", "playthrough_id"]).where("id", "=", id).executeTakeFirst();
  const row = await find(c.id);
  if (!row) throw new NotFoundError(`No quest with id ${c.id}`);
  if (c.mergeInto) {
    const into = await find(c.mergeInto);
    if (!into || into.playthrough_id !== row.playthrough_id) throw new NotFoundError(`No quest with id ${c.mergeInto} in the same playthrough`);
    if (into.id === row.id) throw new InvalidInputError("mergeInto: a quest can't be merged into itself");
    await seen(trx.updateTable("quest_entries"), p, "quest_entries", "full").set({ quest_id: into.id }).where("quest_id", "=", row.id).execute();
    await seen(trx.updateTable("quests"), p, "quests", "full").set({ updated_at: now() }).where("id", "=", into.id).execute();
    await seen(trx.deleteFrom("quests"), p, "quests", "full").where("id", "=", row.id).execute();
    return done(c, row.name, row.playthrough_id, questPath(row.playthrough_id, into.id), { id: into.id, name: into.name });
  }
  if (c.remove) {
    await seen(trx.deleteFrom("quests"), p, "quests", "full").where("id", "=", c.id).execute();
    return done(c, row.name, row.playthrough_id, playthroughPath(row.playthrough_id));
  }
  const name = text("name", c.name);
  if (name) {
    const clash = await seen(trx.selectFrom("quests"), p, "quests", "full")
      .select("id")
      .where("playthrough_id", "=", row.playthrough_id)
      .where("norm", "=", norm(name))
      .where("id", "!=", c.id)
      .executeTakeFirst();
    if (clash)
      throw new AmbiguousError(
        `This playthrough already has a quest called ${name} (id ${clash.id}). If they are one quest, ask the player, then merge with mergeInto`,
      );
  }
  const status = oneOf<QuestStatus>("status", c.status, QUEST_STATUSES);
  await seen(trx.updateTable("quests"), p, "quests", "full")
    .set({
      ...given({
        name,
        norm: name && norm(name),
        local_name: nullable(c.localName),
        giver: nullable(c.giver),
        location: nullable(c.location),
        description: nullable(c.description),
        notes: nullable(c.notes),
        status,
      }),
      updated_at: now(),
    })
    .where("id", "=", c.id)
    .execute();
  return done(c, name ?? row.name, row.playthrough_id, questPath(row.playthrough_id, c.id));
}

async function entry(trx: Trx, p: Player, c: Correction): Promise<Corrected> {
  const joined = trx.selectFrom("quest_entries").innerJoin("quests", "quests.id", "quest_entries.quest_id");
  const row = await seen(seen(joined, p, "quest_entries", "full"), p, "quests", "full")
    .select(["quest_entries.id", "quests.id as quest_id", "quests.name", "quests.playthrough_id"])
    .where("quest_entries.id", "=", c.id)
    .executeTakeFirst();
  if (!row) throw new NotFoundError(`No quest entry with id ${c.id}`);
  const url = questPath(row.playthrough_id, row.quest_id);
  if (c.remove) {
    await seen(trx.deleteFrom("quest_entries"), p, "quest_entries", "full").where("id", "=", c.id).execute();
    return done(c, row.name, row.playthrough_id, url);
  }
  const kind = oneOf<EntryKind>("kind", c.kind ?? undefined, ENTRY_KINDS);
  if (c.kind === null) throw new InvalidInputError(`kind: one of ${ENTRY_KINDS.join(", ")}`);
  const spoiler = oneOf<SpoilerLevel>("spoiler", c.spoiler, SPOILER_LEVELS);
  await seen(trx.updateTable("quest_entries"), p, "quest_entries", "full")
    .set(given({ kind, text: text("text", c.text), spoiler }))
    .where("id", "=", c.id)
    .execute();
  return done(c, row.name, row.playthrough_id, url);
}

async function snapshot(trx: Trx, p: Player, c: Correction): Promise<Corrected> {
  const joined = trx.selectFrom("stat_snapshots").innerJoin("playthroughs", "playthroughs.id", "stat_snapshots.playthrough_id");
  const row = await seen(seen(joined, p, "stat_snapshots"), p, "playthroughs")
    .select(["stat_snapshots.id", "stat_snapshots.taken_on", "stat_snapshots.stats", "stat_snapshots.playthrough_id", "playthroughs.game_id"])
    .where("stat_snapshots.id", "=", c.id)
    .executeTakeFirst();
  if (!row) throw new NotFoundError(`No stat snapshot with id ${c.id}`);
  const url = playthroughPath(row.playthrough_id);
  if (c.remove) {
    await seen(trx.deleteFrom("stat_snapshots"), p, "stat_snapshots").where("id", "=", c.id).execute();
    return done(c, row.taken_on, row.playthrough_id, url);
  }
  let stats: string | undefined;
  if (c.values) {
    // A correction fixes numbers; a stat the game doesn't have yet comes in with record, which also names it.
    const known = (await statNames(p, row.game_id, trx)).map((n) => n.key);
    const unknown = Object.keys(c.values).filter((k) => !known.includes(k));
    if (unknown.length) throw new InvalidInputError(`values: ${unknown.join(", ")} aren't stats of this game (it has ${known.join(", ") || "none yet"})`);
    stats = JSON.stringify({ ...(JSON.parse(row.stats) as Record<string, number>), ...c.values });
  }
  await seen(trx.updateTable("stat_snapshots"), p, "stat_snapshots")
    .set(given({ level: c.level, stats, taken_on: c.playedOn, notes: nullable(c.notes) }))
    .where("id", "=", c.id)
    .execute();
  await reachGoals(trx, p, row.playthrough_id);
  return done(c, c.playedOn ?? row.taken_on, row.playthrough_id, url);
}

async function item(trx: Trx, p: Player, c: Correction): Promise<Corrected> {
  const row = await seen(trx.selectFrom("items"), p, "items", "full")
    .select(["id", "name", "playthrough_id", "sources"])
    .where("id", "=", c.id)
    .executeTakeFirst();
  if (!row) throw new NotFoundError(`No item with id ${c.id}`);
  const { game_id } = await seen(trx.selectFrom("playthroughs"), p, "playthroughs")
    .select("game_id")
    .where("id", "=", row.playthrough_id)
    .executeTakeFirstOrThrow();
  if (c.remove) {
    await seen(trx.deleteFrom("items"), p, "items", "full").where("id", "=", c.id).execute();
    return done(c, row.name, row.playthrough_id, playthroughPath(row.playthrough_id));
  }
  const name = text("name", c.name);
  if (name) {
    const clash = await seen(trx.selectFrom("items"), p, "items", "full")
      .select("id")
      .where("playthrough_id", "=", row.playthrough_id)
      .where("norm", "=", norm(name))
      .where("id", "!=", c.id)
      .executeTakeFirst();
    if (clash)
      throw new AmbiguousError(`This playthrough already has an item called ${name} (id ${clash.id}). If they are one item, ask the player, then remove one`);
  }
  const spoiler = oneOf<SpoilerLevel>("spoiler", c.spoiler, SPOILER_LEVELS);
  await seen(trx.updateTable("items"), p, "items", "full")
    .set({
      ...given({
        name,
        norm: name && norm(name),
        local_name: nullable(c.localName),
        description: nullable(c.description),
        notes: nullable(c.notes),
        kind: c.kind?.trim() ? (await fileItemKind(trx, p, game_id, c.kind)).key : nullable(c.kind),
        location: nullable(c.location),
        verdict: nullable(c.verdict),
        sources: replaceSources(row.sources, c.sources),
        equipped: c.equipped === undefined ? undefined : c.equipped ? 1 : 0,
        spoiler,
        quantity: count("quantity", c.quantity),
        attributes: c.attributes === undefined ? undefined : JSON.stringify(c.attributes),
      }),
      updated_at: now(),
    })
    .where("id", "=", c.id)
    .execute();
  if (c.against) {
    await seen(trx.deleteFrom("item_uses"), p, "item_uses").where("item_id", "=", c.id).execute();
    await writeUses(trx, p, row.playthrough_id, c.id, c.against);
  }
  return done(c, name ?? row.name, row.playthrough_id, itemPath(row.playthrough_id, c.id));
}

async function goal(trx: Trx, p: Player, c: Correction): Promise<Corrected> {
  const joined = trx.selectFrom("goals").innerJoin("playthroughs", "playthroughs.id", "goals.playthrough_id");
  const row = await seen(seen(joined, p, "goals", "full"), p, "playthroughs")
    .select([
      "goals.id",
      "goals.kind",
      "goals.stat",
      "goals.target",
      "goals.text",
      "goals.status",
      "goals.reached_on",
      "goals.playthrough_id",
      "playthroughs.game_id",
    ])
    .where("goals.id", "=", c.id)
    .executeTakeFirst();
  if (!row) throw new NotFoundError(`No goal with id ${c.id}`);
  const url = playthroughPath(row.playthrough_id);
  const names = await statNames(p, row.game_id, trx);
  const label = (target: number | null, txt: string | null) =>
    goalLabel({
      kind: row.kind as GoalKind,
      stat: row.stat ? (names.find((n) => n.key === row.stat) ?? { key: row.stat, name: row.stat, localName: null }) : null,
      target,
      item: null,
      text: txt,
    });
  if (c.remove) {
    await seen(trx.deleteFrom("goals"), p, "goals", "full").where("id", "=", c.id).execute();
    return done(c, label(row.target, row.text), row.playthrough_id, url);
  }
  if (c.target !== undefined && row.kind !== "stat" && row.kind !== "level") throw new InvalidInputError("target: only a stat or level goal has one");
  if (c.rank !== undefined && (!Number.isInteger(c.rank) || c.rank < 1)) throw new InvalidInputError("rank: 1 or more");
  const status = oneOf<GoalStatus>("status", c.status, GOAL_STATUSES);
  const spoiler = oneOf<SpoilerLevel>("spoiler", c.spoiler, SPOILER_LEVELS);
  await seen(trx.updateTable("goals"), p, "goals", "full")
    .set({
      ...given({
        target: c.target,
        text: text("text", c.text),
        status,
        suggested: c.suggested === undefined ? undefined : c.suggested ? 1 : 0,
        rank: c.rank,
        notes: nullable(c.notes),
        spoiler,
        reached_on: status === undefined ? undefined : status === "reached" ? (row.reached_on ?? today()) : null,
      }),
      updated_at: now(),
    })
    .where("id", "=", c.id)
    .execute();
  // A target lowered (or a goal opened again) may be met already.
  await reachGoals(trx, p, row.playthrough_id);
  return done(c, label(c.target ?? row.target, c.text ?? row.text), row.playthrough_id, url);
}

async function codex(trx: Trx, p: Player, c: Correction): Promise<Corrected> {
  const row = await seen(trx.selectFrom("codex"), p, "codex", "full")
    .select(["id", "name", "kind", "playthrough_id", "sources", "beaten_on"])
    .where("id", "=", c.id)
    .executeTakeFirst();
  if (!row) throw new NotFoundError(`No codex entry with id ${c.id}`);
  const url = codexPath(row.playthrough_id, c.id);
  if (c.remove) {
    await seen(trx.deleteFrom("codex"), p, "codex", "full").where("id", "=", c.id).execute();
    return done(c, row.name, row.playthrough_id, playthroughPath(row.playthrough_id));
  }
  const name = text("name", c.name);
  if (name) {
    const clash = await seen(trx.selectFrom("codex"), p, "codex", "full")
      .select("id")
      .where("playthrough_id", "=", row.playthrough_id)
      .where("kind", "=", row.kind)
      .where("norm", "=", norm(name))
      .where("id", "!=", c.id)
      .executeTakeFirst();
    if (clash)
      throw new AmbiguousError(`The codex already has a ${row.kind} called ${name} (id ${clash.id}). If they are one, ask the player, then remove one`);
  }
  const status = oneOf<CodexStatus>("status", c.status, CODEX_STATUSES);
  const spoiler = oneOf<SpoilerLevel>("spoiler", c.spoiler, SPOILER_LEVELS);
  await seen(trx.updateTable("codex"), p, "codex", "full")
    .set({
      ...given({
        name,
        norm: name && norm(name),
        local_name: nullable(c.localName),
        location: nullable(c.location),
        status,
        beaten_on: status === undefined ? undefined : status === "beaten" ? (row.beaten_on ?? today()) : null,
        attempts: count("attempts", c.attempts),
        weaknesses: strings(c.weaknesses),
        resistances: strings(c.resistances),
        strategy: nullable(c.strategy),
        description: nullable(c.description),
        notes: nullable(c.notes),
        spoiler,
        sources: replaceSources(row.sources, c.sources),
      }),
      updated_at: now(),
    })
    .where("id", "=", c.id)
    .execute();
  return done(c, name ?? row.name, row.playthrough_id, url);
}
