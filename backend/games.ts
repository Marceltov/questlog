// Games and playthroughs. A game is the player's own entry for a title, with the stat names and inventory groups it uses as data (values V8); a playthrough
// is one run of it (NG, NG+). Which playthrough a call means is resolved here, for every surface the same way.
import type { Kysely, Transaction } from "kysely";
import { db, newId, now } from "./db";
import type { Schema } from "./db/schema";
import { AmbiguousError, InvalidInputError, NotFoundError } from "./errors";
import { norm } from "./names";
import { seen } from "./spoilers";
import { parseSources } from "./sources";
import type { BackgroundLevel, ItemKind, Player, PlaythroughStatus, Source, SpoilerLevel, StatName } from "./types";
import { playthroughPath } from "./urls";

type Db = Kysely<Schema> | Transaction<Schema>;

/** Who the player plays in a run (ADR 0009): a name and a class (a starting class, a combat memory, in the game's terms). */
export type Character = { name: string | null; class: string | null; localClass: string | null };

export type PlaythroughView = {
  id: string;
  label: string;
  status: PlaythroughStatus;
  language: string | null;
  lastPlayedOn: string | null;
  /** Null until one is filed. */
  character: Character | null;
  /** The player's own notes on this run (ADR 0011). */
  notes: string | null;
  /** How much Claude adds on its own, and what shows without asking (ADR 0016). */
  settings: { background: BackgroundLevel; spoilers: SpoilerLevel };
  /**
   * `sources`: the pages the player trusts for this game (ADR 0008), for Claude to read when the player asks. `itemKinds`: its
   * inventory groups, in the player's order. `description`: what the game is; `notes`: the player's own (ADR 0011).
   */
  game: {
    id: string;
    title: string;
    platform: string | null;
    description: string | null;
    notes: string | null;
    sources: Source[];
    itemKinds: ItemKind[];
  };
  url: string;
};

const columns = [
  "playthroughs.id",
  "playthroughs.label",
  "playthroughs.status",
  "playthroughs.language",
  "playthroughs.last_played_on",
  "playthroughs.character_name",
  "playthroughs.character_class",
  "playthroughs.character_local_class",
  "playthroughs.notes",
  "playthroughs.background",
  "playthroughs.spoilers",
  "games.id as game_id",
  "games.title",
  "games.platform",
  "games.description",
  "games.notes as game_notes",
  "games.sources",
  "games.item_kinds",
] as const;

type Row = {
  id: string;
  label: string;
  status: string;
  language: string | null;
  last_played_on: string | null;
  character_name: string | null;
  character_class: string | null;
  character_local_class: string | null;
  notes: string | null;
  background: string;
  spoilers: string;
  game_id: string;
  title: string;
  platform: string | null;
  description: string | null;
  game_notes: string | null;
  sources: string;
  item_kinds: string;
};

const view = (r: Row): PlaythroughView => ({
  id: r.id,
  label: r.label,
  status: r.status as PlaythroughStatus,
  language: r.language,
  lastPlayedOn: r.last_played_on,
  character:
    r.character_name || r.character_class || r.character_local_class
      ? { name: r.character_name, class: r.character_class, localClass: r.character_local_class }
      : null,
  notes: r.notes,
  settings: { background: r.background as BackgroundLevel, spoilers: r.spoilers as SpoilerLevel },
  game: {
    id: r.game_id,
    title: r.title,
    platform: r.platform,
    description: r.description,
    notes: r.game_notes,
    sources: parseSources(r.sources),
    itemKinds: JSON.parse(r.item_kinds) as ItemKind[],
  },
  url: playthroughPath(r.id),
});

function playthroughs(d: Db, p: Player) {
  return seen(seen(d.selectFrom("playthroughs").innerJoin("games", "games.id", "playthroughs.game_id"), p, "playthroughs"), p, "games").select(columns);
}

/** Every playthrough of the player, most recently played first. */
export async function listPlaythroughs(p: Player): Promise<PlaythroughView[]> {
  const rows = await playthroughs(await db(), p)
    .orderBy("playthroughs.last_played_on", "desc")
    .orderBy("playthroughs.created_at", "desc")
    .execute();
  return rows.map(view);
}

/** One of the player's playthroughs; NotFoundError for one that isn't theirs, as for one that doesn't exist. */
export async function getPlaythrough(p: Player, id: string, d?: Db): Promise<PlaythroughView> {
  const row = await playthroughs(d ?? (await db()), p)
    .where("playthroughs.id", "=", id)
    .executeTakeFirst();
  if (!row) throw new NotFoundError("No such playthrough");
  return view(row);
}

/** How a call names a playthrough: by id, or by its game's title (and its label, when the game has more than one). */
export type PlaythroughRef = { playthroughId?: string; game?: string; label?: string };

/**
 * The playthrough a read means: the one named, else the most recently played of the game named, else the player's most recently played.
 * Null when the player has none (or none of that game).
 */
export async function findPlaythrough(p: Player, ref: PlaythroughRef): Promise<PlaythroughView | null> {
  if (ref.playthroughId) return getPlaythrough(p, ref.playthroughId);
  const all = await listPlaythroughs(p);
  const ofGame = ref.game ? all.filter((t) => norm(t.game.title) === norm(ref.game!)) : all;
  const labelled = ref.label ? ofGame.filter((t) => norm(t.label) === norm(ref.label!)) : ofGame;
  return labelled.find((t) => t.status === "playing") ?? labelled[0] ?? null;
}

export type ResolvedPlaythrough = PlaythroughView & { createdGame: boolean; createdPlaythrough: boolean };

/**
 * The playthrough a recording goes into, inside `trx`. By id; else by game title: a new game starts with a playthrough (label NG unless
 * given), a game being played in one playthrough uses it, and a label picks or starts one. Two being played without a label is for the
 * player to settle (values V4).
 */
export async function playthroughForRecord(
  trx: Transaction<Schema>,
  p: Player,
  ref: { playthroughId?: string; game?: string; platform?: string; label?: string; language?: string },
): Promise<ResolvedPlaythrough> {
  if (ref.playthroughId) return { ...(await getPlaythrough(p, ref.playthroughId, trx)), createdGame: false, createdPlaythrough: false };
  const title = ref.game?.trim();
  if (!title) throw new InvalidInputError("Give playthroughId, or game with the game's title");
  let game = await seen(trx.selectFrom("games"), p, "games").select(["id"]).where("norm", "=", norm(title)).executeTakeFirst();
  let createdGame = false;
  if (!game) {
    game = { id: newId() };
    await trx
      .insertInto("games")
      .values({ id: game.id, player_id: p.id, title, norm: norm(title), platform: ref.platform?.trim() || null, created_at: now() })
      .execute();
    createdGame = true;
  }
  const runs = (await playthroughs(trx, p).where("games.id", "=", game.id).orderBy("playthroughs.created_at", "desc").execute()).map(view);
  const label = ref.label?.trim();
  const pick = label ? runs.find((t) => norm(t.label) === norm(label)) : undefined;
  if (pick) return { ...pick, createdGame, createdPlaythrough: false };
  const playing = runs.filter((t) => t.status === "playing");
  if (!label && playing.length === 1) return { ...playing[0], createdGame, createdPlaythrough: false };
  if (!label && playing.length > 1)
    throw new AmbiguousError(
      `${title} is being played in ${playing.length} playthroughs: ${playing.map((t) => `${t.label} (id ${t.id})`).join(", ")}. Ask the player which one, and pass its playthroughId`,
    );
  if (!label && runs.length)
    throw new AmbiguousError(
      `No playthrough of ${title} is being played (${runs.map((t) => `${t.label}: ${t.status}`).join(", ")}). Ask the player whether this is a new one (pass label, e.g. NG+) or which one to use`,
    );
  const id = newId();
  await trx
    .insertInto("playthroughs")
    .values({
      id,
      player_id: p.id,
      game_id: game.id,
      label: label || "NG",
      language: ref.language?.trim() || null,
      status: "playing",
      last_played_on: null,
      created_at: now(),
    })
    .execute();
  return { ...(await getPlaythrough(p, id, trx)), createdGame, createdPlaythrough: true };
}

/** The stat names a game uses, in the order they were first recorded. */
export async function statNames(p: Player, gameId: string, d?: Db): Promise<StatName[]> {
  const row = await seen((d ?? (await db())).selectFrom("games"), p, "games")
    .select("stats")
    .where("id", "=", gameId)
    .executeTakeFirst();
  return row ? (JSON.parse(row.stats) as StatName[]) : [];
}

/** A game's inventory groups, in the player's order. */
export async function itemKindsOf(p: Player, gameId: string, d?: Db): Promise<ItemKind[]> {
  const row = await seen((d ?? (await db())).selectFrom("games"), p, "games")
    .select("item_kinds")
    .where("id", "=", gameId)
    .executeTakeFirst();
  return row ? (JSON.parse(row.item_kinds) as ItemKind[]) : [];
}

const kindMatches = (k: ItemKind, s: string) => [k.key, k.name, k.localName].some((x) => x && norm(x) === norm(s));

/**
 * The key an item's kind is filed under: the group it names by key, name or local name, else a new group at the end of the game's list
 * (`added`), its key the kind as given.
 */
export async function fileItemKind(trx: Transaction<Schema>, p: Player, gameId: string, kind: string): Promise<{ key: string; added: ItemKind | null }> {
  const known = await itemKindsOf(p, gameId, trx);
  const found = known.find((k) => kindMatches(k, kind));
  if (found) return { key: found.key, added: null };
  const added = { key: norm(kind), name: kind.trim(), localName: null };
  await seen(trx.updateTable("games"), p, "games")
    .set({ item_kinds: JSON.stringify([...known, added]) })
    .where("id", "=", gameId)
    .execute();
  return { key: added.key, added };
}

export type ItemKindInput = { key: string; name?: string; localName?: string | null };

/**
 * Names a game's inventory groups. `merge` (record): a group named by key gets the new names, a new one goes at the end. `replace`
 * (correct): the list as given is the game's, in that order; a group left out that items still use is refused, so none goes missing.
 */
export async function setItemKinds(trx: Transaction<Schema>, p: Player, gameId: string, inputs: ItemKindInput[], mode: "merge" | "replace") {
  const known = await itemKindsOf(p, gameId, trx);
  const out = mode === "merge" ? [...known] : [];
  for (const i of inputs) {
    const key = norm(i.key);
    if (!key) throw new InvalidInputError("itemKinds: every group needs a key");
    const before = known.find((k) => k.key === key);
    const kind: ItemKind = {
      key,
      name: i.name?.trim() || before?.name || i.key.trim(),
      localName: i.localName === null ? null : i.localName?.trim() || before?.localName || null,
    };
    const at = out.findIndex((k) => k.key === key);
    if (at >= 0) {
      if (mode === "replace") throw new InvalidInputError(`itemKinds: ${key} is in the list twice`);
      out[at] = kind;
    } else out.push(kind);
  }
  if (mode === "replace") {
    const dropped = known.filter((k) => !out.some((o) => o.key === k.key)).map((k) => k.key);
    if (dropped.length) {
      const inUse = await seen(trx.selectFrom("items").innerJoin("playthroughs", "playthroughs.id", "items.playthrough_id"), p, "items", "full")
        .select("items.kind")
        .distinct()
        .where("playthroughs.game_id", "=", gameId)
        .where("items.kind", "in", dropped)
        .execute();
      if (inUse.length)
        throw new InvalidInputError(
          `itemKinds: items are still filed under ${inUse.map((r) => r.kind).join(", ")}; give them another kind first, or keep the group`,
        );
    }
  }
  await seen(trx.updateTable("games"), p, "games")
    .set({ item_kinds: JSON.stringify(out) })
    .where("id", "=", gameId)
    .execute();
  return out;
}
