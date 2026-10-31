// The per-player daily limit on the in-app chat (ADR 0013): each message counts once, however many tool rounds it takes.
import { config } from "./config";
import { db } from "./db";
import { seen } from "./spoilers";
import type { Player } from "./types";

/** Counts this message against the player's limit for `day`; false when it is used up. One conditional UPDATE, so two messages sent
 * at the same moment can't both slip past the last free one. */
export async function spend(p: Player, day: string): Promise<boolean> {
  const d = await db();
  await d
    .insertInto("chat_usage")
    .values({ player_id: p.id, day, count: 0 })
    .onConflict((oc) => oc.doNothing())
    .execute();
  const r = await seen(d.updateTable("chat_usage"), p, "chat_usage")
    .set((eb) => ({ count: eb("count", "+", 1) }))
    .where("day", "=", day)
    .where("count", "<", config.chatDailyLimit())
    .executeTakeFirst();
  return Number(r.numUpdatedRows) === 1;
}
