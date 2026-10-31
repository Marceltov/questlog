// The tags in use in one of the player's playthroughs (ADR 0014), counted over what they have found there: a tag only a spoiler carries
// stays out. Its own module, as it reads items, the codex and quests, which read tags.ts.
import { codexOf } from "./codex";
import { db } from "./db";
import { getPlaythrough } from "./games";
import { itemsOf } from "./items";
import { questsOf } from "./quests";
import { withIds } from "./tags";
import type { Player } from "./types";

export type TagInUse = { id: string; name: string; count: number };

/** Most used first; NotFoundError for another player's playthrough. */
export async function tagsInPlaythrough(p: Player, playthroughId: string): Promise<TagInUse[]> {
  const t = await getPlaythrough(p, playthroughId);
  const [items, codex, quests] = await Promise.all([itemsOf(p, t.id), codexOf(p, t.id), questsOf(p, t.id)]);
  return withIds(await db(), p, t.game.id, [...items, ...codex, ...quests]);
}
