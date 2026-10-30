// Games and playthroughs. A game is the player's own entry for a title, with the stat names it uses as data (values V8); a playthrough
// is one run of it (NG, NG+). Which playthrough a call means is resolved here, for every surface the same way.
import type { Kysely, Transaction } from "kysely";
import { db, newId, now } from "./db";
import type { Schema } from "./db/schema";
import { AmbiguousError, InvalidInputError, NotFoundError } from "./errors";
import { norm } from "./names";
import { seen } from "./spoilers";
import type { Player, PlaythroughStatus, StatName } from "./types";
import { playthroughPath } from "./urls";

type Db = Kysely<Schema> | Transaction<Schema>;

export type PlaythroughView = {
  id: string;
  label: string;
  status: PlaythroughStatus;
  language: string | null;
  lastPlayedOn: string | null;
  game: { id: string; title: string; platform: string | null };
  url: string;
};

const columns = [
  "playthroughs.id",
  "playthroughs.label",
  "playthroughs.status",
  "playthroughs.language",
  "playthroughs.last_played_on",
  "games.id as game_id",
  "games.title",
  "games.platform",
] as const;

type Row = {
  id: string;
  label: string;
  status: string;
  language: string | null;
  last_played_on: string | null;
  game_id: string;
  title: string;
  platform: string | null;
};

const view = (r: Row): PlaythroughView => ({
  id: r.id,
  label: r.label,
  status: r.status as PlaythroughStatus,
  language: r.language,
  lastPlayedOn: r.last_played_on,
  game: { id: r.game_id, title: r.title, platform: r.platform },
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
