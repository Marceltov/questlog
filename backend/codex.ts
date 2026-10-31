// The codex (ADR 0010): the bosses, enemies, NPCs and places the player met in a playthrough, with what helps against them. Kept like
// quests: only what the player met (values V1), matched by id or by exact name within its kind (values V4), with a spoiler level for
// what Claude files from its own knowledge or a guide. What an item is good or bad against (item_uses) links the inventory to it; a
// link shows only when both ends may.
import type { Kysely, Transaction } from "kysely";
import { db, newId, now } from "./db";
import type { Schema } from "./db/schema";
import { AmbiguousError, InvalidInputError, NotFoundError } from "./errors";
import { getPlaythrough } from "./games";
import { norm } from "./names";
import { addNote } from "./notes";
import { seen } from "./spoilers";
import { mergeSources, parseSources } from "./sources";
import { tagsOf } from "./tags";
import { CODEX_KINDS, EFFECTS, type CodexKind, type CodexStatus, type Effect, type Player, type Source, type SourceInput, type SpoilerLevel } from "./types";
import { codexPath, itemPath } from "./urls";

type Db = Kysely<Schema> | Transaction<Schema>;

export type CodexView = {
  id: string;
  kind: CodexKind;
  name: string;
  localName: string | null;
  location: string | null;
  /** What it is, as the game or a guide puts it (ADR 0011). */
  description: string | null;
  status: CodexStatus;
  /** A boss's tries so far, as the player counts them. */
  attempts: number | null;
  beatenOn: string | null;
  weaknesses: string[];
  resistances: string[];
  /** How to go about it, in the player's terms or from a guide (then with its source). */
  strategy: string | null;
  /** The player's own notes. */
  notes: string | null;
  spoiler: SpoilerLevel;
  sources: Source[];
  /** The player's items rated against it, best first (very good to very bad), with how many they have. */
  counters: { item: { id: string; name: string; kind: string | null; quantity: number | null; url: string }; effect: Effect; note: string | null }[];
  /** Its tags (ADR 0014), by name. */
  tags: string[];
  url: string;
};

export type CodexInput = {
  id?: string;
  kind?: CodexKind;
  name: string;
  localName?: string;
  location?: string;
  status?: CodexStatus;
  attempts?: number;
  weaknesses?: string[];
  resistances?: string[];
  strategy?: string;
  /** What it is, as the game or a guide puts it; replaces the one it has. */
  description?: string;
  /** The player's own thoughts, added to its notes. */
  notes?: string;
  spoiler?: SpoilerLevel;
  sources?: SourceInput[];
};

export type FiledCodex = {
  id: string;
  kind: CodexKind;
  name: string;
  status: CodexStatus;
  statusBefore: CodexStatus | null;
  created: boolean;
  spoiler: SpoilerLevel;
  url: string;
};

const list = (json: string) => JSON.parse(json) as string[];
// Merged case-insensitively, keeping the first spelling and the order.
const union = (before: string[], added: string[] | undefined) => {
  const out = [...before];
  for (const a of added ?? []) if (a.trim() && !out.some((b) => norm(b) === norm(a))) out.push(a.trim());
  return out;
};

/** The codex of one of the player's playthroughs, by kind (bosses first), what is still in the way before what is beaten, then by name. */
export async function codexOf(
  p: Player,
  playthroughId: string,
  opts: { kind?: CodexKind; name?: string; reveal?: SpoilerLevel; statuses?: readonly CodexStatus[]; /** Only entries that carry this tag. */ tag?: string } = {},
): Promise<CodexView[]> {
  await getPlaythrough(p, playthroughId); // NotFoundError for another player's
  const d = await db();
  const reveal = opts.reveal ?? "none";
  let q = seen(d.selectFrom("codex"), p, "codex", reveal).selectAll().where("playthrough_id", "=", playthroughId);
  if (opts.kind) q = q.where("kind", "=", opts.kind);
  if (opts.statuses) q = q.where("status", "in", [...opts.statuses]);
  const name = opts.name ? norm(opts.name) : "";
  const named = (await q.execute()).filter((r) => !name || r.norm.includes(name) || (r.local_name && norm(r.local_name).includes(name)));
  const tags = await tagsOf(
    d,
    p,
    "codex",
    named.map((r) => r.id),
  );
  const rows = opts.tag ? named.filter((r) => (tags.get(r.id) ?? []).some((t) => norm(t) === norm(opts.tag!))) : named;
  const counters = await countersOf(
    d,
    p,
    rows.map((r) => r.id),
    reveal,
  );
  const STATUS: Record<string, number> = { met: 0, beaten: 1, gone: 2 };
  return rows
    .sort(
      (a, b) =>
        CODEX_KINDS.indexOf(a.kind as CodexKind) - CODEX_KINDS.indexOf(b.kind as CodexKind) ||
        STATUS[a.status] - STATUS[b.status] ||
        a.name.localeCompare(b.name),
    )
    .map((r) => ({
      id: r.id,
      kind: r.kind as CodexKind,
      name: r.name,
      localName: r.local_name,
      location: r.location,
      description: r.description,
      status: r.status as CodexStatus,
      attempts: r.attempts,
      beatenOn: r.beaten_on,
      weaknesses: list(r.weaknesses),
      resistances: list(r.resistances),
      strategy: r.strategy,
      notes: r.notes,
      spoiler: r.spoiler as SpoilerLevel,
      sources: parseSources(r.sources),
      counters: counters
        .filter((c) => c.codexId === r.id)
        .map(({ item, effect, note }) => ({ item: { ...item, url: itemPath(playthroughId, item.id) }, effect, note })),
      tags: tags.get(r.id) ?? [],
      url: codexPath(playthroughId, r.id),
    }));
}

// Best first, keeping the order by name within one effect.
const best = (a: { effect: string }, b: { effect: string }) => EFFECTS.indexOf(a.effect as Effect) - EFFECTS.indexOf(b.effect as Effect);

/** The item ends of the given codex entries' links, through the gate on both tables. */
async function countersOf(d: Db, p: Player, codexIds: string[], reveal: SpoilerLevel) {
  if (!codexIds.length) return [];
  const rows = await seen(seen(d.selectFrom("item_uses").innerJoin("items", "items.id", "item_uses.item_id"), p, "item_uses"), p, "items", reveal)
    .select(["item_uses.codex_id", "item_uses.effect", "item_uses.note", "items.id", "items.name", "items.kind", "items.quantity"])
    .where("item_uses.codex_id", "in", codexIds)
    .orderBy("items.name")
    .execute();
  return rows.sort(best).map((r) => ({
    codexId: r.codex_id,
    effect: r.effect as Effect,
    note: r.note,
    item: { id: r.id, name: r.name, kind: r.kind, quantity: r.quantity },
  }));
}

/** The codex ends of the given items' links (what each is good or bad against), through the gate on both tables. */
export async function usesOf(d: Db, p: Player, itemIds: string[], reveal: SpoilerLevel) {
  if (!itemIds.length) return [];
  const rows = await seen(seen(d.selectFrom("item_uses").innerJoin("codex", "codex.id", "item_uses.codex_id"), p, "item_uses"), p, "codex", reveal)
    .select(["item_uses.item_id", "item_uses.effect", "item_uses.note", "codex.id", "codex.name", "codex.kind", "codex.playthrough_id"])
    .where("item_uses.item_id", "in", itemIds)
    .orderBy("codex.name")
    .execute();
  return rows.sort(best).map((r) => ({
    itemId: r.item_id,
    effect: r.effect as Effect,
    note: r.note,
    codex: { id: r.id, name: r.name, kind: r.kind as CodexKind, url: codexPath(r.playthrough_id, r.id) },
  }));
}

/** A codex entry of the playthrough by id, or by exact name (within `kind` when given). Several kinds with that name: for the player to say. */
export async function findCodex(trx: Transaction<Schema>, p: Player, playthroughId: string, ref: string, kind?: CodexKind) {
  let q = seen(trx.selectFrom("codex"), p, "codex", "full")
    .selectAll()
    .where("playthrough_id", "=", playthroughId)
    .where((eb) => eb.or([eb("id", "=", ref), eb("norm", "=", norm(ref))]));
  if (kind) q = q.where("kind", "=", kind);
  const rows = await q.execute();
  if (rows.length > 1)
    throw new AmbiguousError(`${ref} is in the codex more than once (${rows.map((r) => `${r.kind}, id ${r.id}`).join("; ")}): pass the id or the kind`);
  return rows[0];
}

/** Files codex entries into a playthrough, as met in `sessionId` on `playedOn`. */
export async function writeCodex(
  trx: Transaction<Schema>,
  p: Player,
  playthroughId: string,
  sessionId: string,
  playedOn: string,
  inputs: CodexInput[],
): Promise<FiledCodex[]> {
  const out: FiledCodex[] = [];
  const at = now();
  for (const c of inputs) {
    const name = c.name.trim();
    if (c.attempts !== undefined && (!Number.isInteger(c.attempts) || c.attempts < 0)) throw new InvalidInputError("codex: attempts is a count, 0 or more");
    const existing = c.id ? await findCodex(trx, p, playthroughId, c.id) : name ? await findCodex(trx, p, playthroughId, name, c.kind) : undefined;
    if (c.id && !existing) throw new NotFoundError(`No codex entry with id ${c.id} in this playthrough`);
    if (existing) {
      const status = c.status ?? (existing.status as CodexStatus);
      await seen(trx.updateTable("codex"), p, "codex", "full")
        .set({
          status,
          beaten_on: status === "beaten" ? (existing.beaten_on ?? playedOn) : existing.beaten_on,
          weaknesses: JSON.stringify(union(list(existing.weaknesses), c.weaknesses)),
          resistances: JSON.stringify(union(list(existing.resistances), c.resistances)),
          ...(c.localName?.trim() ? { local_name: c.localName.trim() } : {}),
          ...(c.location?.trim() ? { location: c.location.trim() } : {}),
          ...(c.attempts !== undefined ? { attempts: c.attempts } : {}),
          ...(c.strategy?.trim() ? { strategy: c.strategy.trim() } : {}),
          ...(c.description?.trim() ? { description: c.description.trim() } : {}),
          notes: addNote(existing.notes, c.notes),
          ...(c.spoiler ? { spoiler: c.spoiler } : {}),
          ...(c.sources?.length ? { sources: JSON.stringify(mergeSources(parseSources(existing.sources), c.sources, playedOn)) } : {}),
          updated_at: at,
        })
        .where("id", "=", existing.id)
        .execute();
      if (!out.some((x) => x.id === existing.id))
        out.push({
          id: existing.id,
          kind: existing.kind as CodexKind,
          name: existing.name,
          status,
          statusBefore: existing.status as CodexStatus,
          created: false,
          spoiler: (c.spoiler ?? existing.spoiler) as SpoilerLevel,
          url: codexPath(playthroughId, existing.id),
        });
      continue;
    }
    if (!name) throw new InvalidInputError("codex: every new entry needs a name");
    if (!c.kind) throw new InvalidInputError(`codex: ${name} is new; give its kind (${CODEX_KINDS.join(", ")})`);
    const id = newId();
    const status = c.status ?? "met";
    const spoiler = c.spoiler ?? "none";
    await trx
      .insertInto("codex")
      .values({
        id,
        player_id: p.id,
        playthrough_id: playthroughId,
        session_id: sessionId,
        kind: c.kind,
        name,
        norm: norm(name),
        local_name: c.localName?.trim() || null,
        location: c.location?.trim() || null,
        status,
        attempts: c.attempts ?? null,
        beaten_on: status === "beaten" ? playedOn : null,
        weaknesses: JSON.stringify(union([], c.weaknesses)),
        resistances: JSON.stringify(union([], c.resistances)),
        strategy: c.strategy?.trim() || null,
        description: c.description?.trim() || null,
        notes: addNote(null, c.notes),
        spoiler,
        sources: JSON.stringify(mergeSources([], c.sources ?? [], playedOn)),
        created_at: at,
        updated_at: at,
      })
      .execute();
    out.push({ id, kind: c.kind, name, status, statusBefore: null, created: true, spoiler, url: codexPath(playthroughId, id) });
  }
  return out;
}

export type AgainstInput = { target: string; effect?: Effect; note?: string };

/** Links an item to what it is rated against (good by default), each by codex id or exact name; a link that is there gets the new effect and note. */
export async function writeUses(trx: Transaction<Schema>, p: Player, playthroughId: string, itemId: string, against: AgainstInput[]) {
  for (const a of against) {
    const target = await findCodex(trx, p, playthroughId, a.target.trim());
    if (!target) throw new NotFoundError(`against: no ${a.target} in the codex of this playthrough; file it under codex first (with its kind)`);
    const note = a.note?.trim() || null;
    const there = await seen(trx.selectFrom("item_uses"), p, "item_uses")
      .select("effect")
      .where("item_id", "=", itemId)
      .where("codex_id", "=", target.id)
      .executeTakeFirst();
    if (there) {
      if (note || a.effect)
        await seen(trx.updateTable("item_uses"), p, "item_uses")
          .set({ ...(note ? { note } : {}), ...(a.effect ? { effect: a.effect } : {}) })
          .where("item_id", "=", itemId)
          .where("codex_id", "=", target.id)
          .execute();
    } else
      await trx
        .insertInto("item_uses")
        .values({ item_id: itemId, codex_id: target.id, player_id: p.id, effect: a.effect ?? "good", note, created_at: now() })
        .execute();
  }
}
