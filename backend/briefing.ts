// "Where was I?": for one playthrough, the last session, the open quests, the build and what is equipped. A briefing never asks the gate
// for spoilers (values V1): it shows only what the player found and told.
import { buildOf, type SnapshotView } from "./builds";
import { findPlaythrough, listPlaythroughs, type PlaythroughRef, type PlaythroughView } from "./games";
import { itemsOf, type ItemView } from "./items";
import { questsOf, type QuestView } from "./quests";
import { sessionsOf, type SessionSummary } from "./sessions";
import { OPEN_STATUSES, type Player } from "./types";

export type Briefing = {
  /** Null when the player has no playthrough (of the game asked for). */
  playthrough: PlaythroughView | null;
  lastSession: SessionSummary | null;
  /** Open first, then blocked; each with its latest next step and log. */
  openQuests: QuestView[];
  build: { plan: { summary: string | null; mainStat: string | null; targets: Record<string, number> } | null; current: SnapshotView | null };
  equipped: ItemView[];
  /** The player's other playthroughs, most recently played first. */
  others: PlaythroughView[];
};

export async function briefing(p: Player, ref: PlaythroughRef = {}): Promise<Briefing> {
  const t = await findPlaythrough(p, ref);
  const others = (await listPlaythroughs(p)).filter((x) => x.id !== t?.id);
  if (!t) return { playthrough: null, lastSession: null, openQuests: [], build: { plan: null, current: null }, equipped: [], others };
  const [sessions, quests, build, equipped] = await Promise.all([
    sessionsOf(p, t.id, 1),
    questsOf(p, t.id, { statuses: OPEN_STATUSES, reveal: "none" }),
    buildOf(p, t.id, 1),
    itemsOf(p, t.id, { equippedOnly: true, reveal: "none" }),
  ]);
  return {
    playthrough: t,
    lastSession: sessions[0] ?? null,
    openQuests: [...quests.filter((q) => q.status === "open"), ...quests.filter((q) => q.status === "blocked")],
    build: { plan: build.plan, current: build.snapshots[0] ?? null },
    equipped,
    others,
  };
}
