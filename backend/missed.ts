// "Did I miss anything?" (values V1): only when the player asked, never in a briefing. What questlog can say comes from the player's own
// log, not from a game database (V6): the hints and spoilers Claude filed and the reads so far left out, and the open quests the player
// hasn't touched for a while. Hidden rows are read through the gate at the level the player asked for; nothing else is.
import { db } from "./db";
import { findPlaythrough, type PlaythroughRef, type PlaythroughView } from "./games";
import { itemsOf, type ItemView } from "./items";
import { questsOf, type QuestEntryView, type QuestView } from "./quests";
import { seen } from "./spoilers";
import { OPEN_STATUSES, type Player, type SpoilerLevel } from "./types";

/** An open quest counts as left behind when it hasn't changed in this many of the playthrough's latest sessions. */
export const STALE_AFTER = 3;

export type Missed = {
  playthrough: PlaythroughView | null;
  reveal: Exclude<SpoilerLevel, "none">;
  /** Quests with entries above `none`, each with only those entries. */
  hidden: (QuestView & { hidden: QuestEntryView[] })[];
  /** Items above `none`. */
  hiddenItems: ItemView[];
  /** Open quests (not blocked) that haven't changed in the last STALE_AFTER sessions; none of their own entries is a spoiler. */
  leftBehind: QuestView[];
};

export async function missed(p: Player, ref: PlaythroughRef, reveal: Missed["reveal"]): Promise<Missed> {
  const t = await findPlaythrough(p, ref);
  if (!t) return { playthrough: null, reveal, hidden: [], hiddenItems: [], leftBehind: [] };
  const [quests, items, plain] = await Promise.all([
    questsOf(p, t.id, { reveal }),
    itemsOf(p, t.id, { reveal }),
    questsOf(p, t.id, { statuses: ["open"], reveal: "none" }),
  ]);
  const hidden = quests
    .map((q) => ({ ...q, hidden: q.entries.filter((e) => e.spoiler !== "none") }))
    .filter((q) => q.hidden.length && OPEN_STATUSES.includes(q.status));
  // The session STALE_AFTER back: a quest last changed before it was filed has sat through that many sessions.
  const sessions = await seen((await db()).selectFrom("sessions"), p, "sessions")
    .select("created_at")
    .where("playthrough_id", "=", t.id)
    .orderBy("created_at", "desc")
    .limit(STALE_AFTER)
    .execute();
  const since = sessions.length === STALE_AFTER ? sessions[STALE_AFTER - 1].created_at : null;
  const leftBehind = since === null ? [] : plain.filter((q) => q.updatedAt < since);
  return { playthrough: t, reveal, hidden, hiddenItems: items.filter((i) => i.spoiler !== "none"), leftBehind };
}
