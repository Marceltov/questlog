// Whether a playthrough holds more than a read showed (ADR 0016): the setting is what shows without asking, and above it Claude only
// offers. So a read may say that more is there, as one yes or no, never how much or what (ADR 0005 had no read say even that).
import { db } from "./db";
import { seen } from "./spoilers";
import type { TagTarget } from "./tags";
import { SPOILER_LEVELS, type Player, type SpoilerLevel } from "./types";

const TABLES = { item: "items", codex: "codex", quest: "quests" } as const;

/** True when the player's rows of `what` in the playthrough (their quest entries and background lines included) go above `reveal`. */
export async function moreAbove(p: Player, playthroughId: string, reveal: SpoilerLevel, what: readonly TagTarget[]): Promise<boolean> {
  const above = SPOILER_LEVELS.slice(SPOILER_LEVELS.indexOf(reveal) + 1);
  if (!above.length) return false;
  const d = await db();
  for (const w of what) {
    const table = TABLES[w];
    const ids = (await seen(d.selectFrom(table), p, table, "full").select("id").where("playthrough_id", "=", playthroughId).execute()).map((r) => r.id);
    if (!ids.length) continue;
    const own = await seen(d.selectFrom(table), p, table, "full").select("id").where("id", "in", ids).where("spoiler", "in", above).executeTakeFirst();
    if (own) return true;
    const lines = await seen(d.selectFrom("background"), p, "background", "full")
      .select("id")
      .where("what", "=", w)
      .where("row_id", "in", ids)
      .where("spoiler", "in", above)
      .executeTakeFirst();
    if (lines) return true;
    if (w === "quest") {
      const entries = await seen(d.selectFrom("quest_entries"), p, "quest_entries", "full")
        .select("id")
        .where("quest_id", "in", ids)
        .where("spoiler", "in", above)
        .executeTakeFirst();
      if (entries) return true;
    }
  }
  return false;
}
