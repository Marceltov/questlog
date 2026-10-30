// Reading items: what the player found, where, whether it is equipped, and Claude's verdict, as far as the read may show (spoilers.ts).
import { db } from "./db";
import { getPlaythrough } from "./games";
import { norm } from "./names";
import { seen } from "./spoilers";
import { parseSources } from "./sources";
import type { Player, Source, SpoilerLevel } from "./types";
import { itemPath } from "./urls";

export type ItemView = {
  id: string;
  name: string;
  localName: string | null;
  kind: string | null;
  location: string | null;
  equipped: boolean;
  verdict: string | null;
  spoiler: SpoilerLevel;
  /** Where its facts come from (ADR 0008); shown with the item, so as far as the item is. */
  sources: Source[];
  url: string;
};

/** The items of one of the player's playthroughs, equipped first, then the newest. */
export async function itemsOf(
  p: Player,
  playthroughId: string,
  opts: { equippedOnly?: boolean; reveal?: SpoilerLevel; /** Only items whose name, or name in the game's language, contains it. */ name?: string } = {},
): Promise<ItemView[]> {
  await getPlaythrough(p, playthroughId); // NotFoundError for another player's
  let q = seen((await db()).selectFrom("items"), p, "items", opts.reveal ?? "none")
    .selectAll()
    .where("playthrough_id", "=", playthroughId);
  if (opts.equippedOnly) q = q.where("equipped", "=", 1);
  const rows = await q.orderBy("equipped", "desc").orderBy("updated_at", "desc").execute();
  // A search within what came through the gate, in the norm form, so "puppet saber" finds "Puppet Saber" and "Saebel" finds "Säbel".
  const name = opts.name ? norm(opts.name) : "";
  return rows
    .filter((r) => !name || norm(r.name).includes(name) || (r.local_name && norm(r.local_name).includes(name)))
    .map((r) => ({
      id: r.id,
      name: r.name,
      localName: r.local_name,
      kind: r.kind,
      location: r.location,
      equipped: r.equipped === 1,
      verdict: r.verdict,
      spoiler: r.spoiler as SpoilerLevel,
      sources: parseSources(r.sources),
      url: itemPath(playthroughId, r.id),
    }));
}
