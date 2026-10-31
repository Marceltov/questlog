// "Where was I?": for one playthrough, the last session, the open quests, the build and what is equipped. A briefing never asks the gate
// for spoilers (values V1): it shows only what the player found and told.
import { buildOf, type SnapshotView } from "./builds";
import type { GoalView } from "./goals";
import { codexOf, type CodexView } from "./codex";
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
  build: {
    plan: { summary: string | null; mainStat: string | null; targets: Record<string, number> } | null;
    /** Open goals by rank (the player's, then suggestions), then the reached ones. */
    goals: GoalView[];
    current: SnapshotView | null;
  };
  equipped: ItemView[];
  /** Bosses met and not beaten yet. */
  bosses: CodexView[];
  /** The player's other playthroughs, most recently played first. */
  others: PlaythroughView[];
};

export async function briefing(p: Player, ref: PlaythroughRef = {}): Promise<Briefing> {
  const t = await findPlaythrough(p, ref);
  const others = (await listPlaythroughs(p)).filter((x) => x.id !== t?.id);
  if (!t) return { playthrough: null, lastSession: null, openQuests: [], build: { plan: null, goals: [], current: null }, equipped: [], bosses: [], others };
  const [sessions, quests, build, equipped, bosses] = await Promise.all([
    sessionsOf(p, t.id, 1),
    // As far as the player's spoiler setting goes (ADR 0016), never further: a briefing never asks for more.
    questsOf(p, t.id, { statuses: OPEN_STATUSES, reveal: t.settings.spoilers }),
    buildOf(p, t.id, 1),
    itemsOf(p, t.id, { equippedOnly: true, reveal: t.settings.spoilers }),
    codexOf(p, t.id, { kind: "boss", statuses: ["met"], reveal: t.settings.spoilers }),
  ]);
  return {
    playthrough: t,
    lastSession: sessions[0] ?? null,
    openQuests: [...quests.filter((q) => q.status === "open"), ...quests.filter((q) => q.status === "blocked")],
    build: { plan: build.plan, goals: build.goals, current: build.snapshots[0] ?? null },
    equipped,
    bosses,
    others,
  };
}
