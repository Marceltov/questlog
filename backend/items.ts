// Reading items, the player's inventory: what they found, how many, its numbers, where, whether it is equipped, what it is good or bad
// against (ADR 0010) and Claude's verdict, as far as the read may show (spoilers.ts).
import { usesOf } from "./codex";
import { db } from "./db";
import { getPlaythrough } from "./games";
import { norm } from "./names";
import { seen } from "./spoilers";
import { parseSources } from "./sources";
import type { Attributes, CodexKind, Effect, Player, Source, SpoilerLevel } from "./types";
import { itemPath } from "./urls";

export type ItemView = {
  id: string;
  name: string;
  localName: string | null;
  /** What it is, as the game describes it (ADR 0011). */
  description: string | null;
  /** The player's own notes on it. */
  notes: string | null;
  /** The key of one of the game's inventory groups (ItemKind). */
  kind: string | null;
  /** How many the player has, for what comes in numbers; null when it isn't counted. */
  quantity: number | null;
  /** Its numbers as the game shows them, by the game's names. */
  attributes: Attributes;
  /** The codex entries it is good against (`good`), or better not used on (`bad`). */
  against: { codex: { id: string; name: string; kind: CodexKind; url: string }; effect: Effect; note: string | null }[];
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
  const found = rows.filter((r) => !name || norm(r.name).includes(name) || (r.local_name && norm(r.local_name).includes(name)));
  const uses = await usesOf(
    await db(),
    p,
    found.map((r) => r.id),
    opts.reveal ?? "none",
  );
  return found.map((r) => ({
    id: r.id,
    name: r.name,
    localName: r.local_name,
    description: r.description,
    notes: r.notes,
    kind: r.kind,
    quantity: r.quantity,
    attributes: JSON.parse(r.attributes) as Attributes,
    against: uses.filter((u) => u.itemId === r.id).map(({ codex, effect, note }) => ({ codex, effect, note })),
    location: r.location,
    equipped: r.equipped === 1,
    verdict: r.verdict,
    spoiler: r.spoiler as SpoilerLevel,
    sources: parseSources(r.sources),
    url: itemPath(playthroughId, r.id),
  }));
}
