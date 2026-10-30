// The build of a playthrough: the plan (main stat, targets) and the dated stat snapshots, each stat named as the game names it (V8).
import { db } from "./db";
import { getPlaythrough, statNames } from "./games";
import { seen } from "./spoilers";
import type { Player, StatName } from "./types";

export type StatValue = StatName & { value: number; /** Since the snapshot before; null for the first. */ change: number | null };
export type SnapshotView = { id: string; takenOn: string; level: number | null; stats: StatValue[] };
export type BuildView = {
  plan: { summary: string | null; mainStat: string | null; targets: Record<string, number> } | null;
  /** Newest first. */
  snapshots: SnapshotView[];
};

/** The build of one of the player's playthroughs, with at most `limit` snapshots. */
export async function buildOf(p: Player, playthroughId: string, limit = 20): Promise<BuildView> {
  const t = await getPlaythrough(p, playthroughId); // NotFoundError for another player's
  const d = await db();
  const plan = await seen(d.selectFrom("build_plans"), p, "build_plans").selectAll().where("playthrough_id", "=", playthroughId).executeTakeFirst();
  const rows = await seen(d.selectFrom("stat_snapshots"), p, "stat_snapshots")
    .selectAll()
    .where("playthrough_id", "=", playthroughId)
    .orderBy("taken_on", "desc")
    .orderBy("created_at", "desc")
    .limit(limit + 1)
    .execute();
  const names = await statNames(p, t.game.id);
  const named = (key: string): StatName => names.find((n) => n.key === key) ?? { key, name: key, localName: null };
  const parsed = rows.map((r) => ({ ...r, values: JSON.parse(r.stats) as Record<string, number> }));
  const snapshots = parsed.slice(0, limit).map((r, i) => {
    const before = parsed[i + 1]?.values;
    // In the game's order; a stat the game doesn't list yet goes last.
    const keys = Object.keys(r.values).sort((a, b) => (names.findIndex((n) => n.key === a) + 1 || 1e9) - (names.findIndex((n) => n.key === b) + 1 || 1e9));
    return {
      id: r.id,
      takenOn: r.taken_on,
      level: r.level,
      stats: keys.map((k) => ({ ...named(k), value: r.values[k], change: before && k in before ? r.values[k] - before[k] : null })),
    };
  });
  return {
    plan: plan ? { summary: plan.summary, mainStat: plan.main_stat, targets: JSON.parse(plan.targets) as Record<string, number> } : null,
    snapshots,
  };
}
