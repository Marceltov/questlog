// Reading quests: each with its log, its next step and the choices made, as far as the read may show (spoilers.ts).
import { sql } from "kysely";
import { db } from "./db";
import { getPlaythrough } from "./games";
import { seen } from "./spoilers";
import type { EntryKind, Player, QuestStatus, SpoilerLevel } from "./types";
import { questPath, sessionPath } from "./urls";

export type QuestEntryView = { id: string; kind: EntryKind; text: string; spoiler: SpoilerLevel; on: string | null; sessionUrl: string | null };

export type QuestView = {
  id: string;
  name: string;
  localName: string | null;
  giver: string | null;
  location: string | null;
  status: QuestStatus;
  spoiler: SpoilerLevel;
  /** The latest `next` entry the read may show; null when there is none. */
  nextStep: string | null;
  /** Oldest first. */
  entries: QuestEntryView[];
  url: string;
};

/** The quests of one of the player's playthroughs with one of `statuses`, most recently changed first, showing no more than `reveal`. */
export async function questsOf(
  p: Player,
  playthroughId: string,
  opts: { statuses?: readonly QuestStatus[]; reveal?: SpoilerLevel } = {},
): Promise<QuestView[]> {
  const reveal = opts.reveal ?? "none";
  await getPlaythrough(p, playthroughId); // NotFoundError for another player's
  const d = await db();
  let q = seen(d.selectFrom("quests"), p, "quests", reveal).selectAll().where("playthrough_id", "=", playthroughId);
  if (opts.statuses) q = q.where("status", "in", [...opts.statuses]);
  const quests = await q
    .orderBy("updated_at", "desc")
    .orderBy(sql`quests.rowid`, "desc")
    .execute();
  if (!quests.length) return [];
  const entries = await seen(d.selectFrom("quest_entries"), p, "quest_entries", reveal)
    .selectAll()
    .where(
      "quest_id",
      "in",
      quests.map((x) => x.id),
    )
    // In the order they were filed: the entries of one call share a time, and the rowid keeps their order.
    .orderBy(sql`quest_entries.rowid`)
    .execute();
  const sessionIds = [...new Set(entries.map((e) => e.session_id).filter((s): s is string => !!s))];
  const days = new Map(
    sessionIds.length
      ? (await seen(d.selectFrom("sessions"), p, "sessions").select(["id", "played_on"]).where("id", "in", sessionIds).execute()).map((s) => [
          s.id,
          s.played_on,
        ])
      : [],
  );
  return quests.map((x) => {
    const mine = entries
      .filter((e) => e.quest_id === x.id)
      .map((e): QuestEntryView => ({
        id: e.id,
        kind: e.kind as EntryKind,
        text: e.text,
        spoiler: e.spoiler as SpoilerLevel,
        on: (e.session_id && days.get(e.session_id)) || null,
        sessionUrl: e.session_id && days.has(e.session_id) ? sessionPath(e.session_id) : null,
      }));
    return {
      id: x.id,
      name: x.name,
      localName: x.local_name,
      giver: x.giver,
      location: x.location,
      status: x.status as QuestStatus,
      spoiler: x.spoiler as SpoilerLevel,
      nextStep: mine.findLast((e) => e.kind === "next")?.text ?? null,
      entries: mine,
      url: questPath(playthroughId, x.id),
    };
  });
}
