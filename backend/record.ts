// Filing a play session: the transcript as the player said it (values V3), and what was filed from it: quest entries, a stat snapshot,
// the build plan, items. One transaction; everything points to the session. Quests and items are matched by id or by their exact name
// in the playthrough, never by a guess (values V4).
import { db, newId, now } from "./db";
import { today } from "./dates";
import { playthroughForRecord, statNames, type ResolvedPlaythrough } from "./games";
import { InvalidInputError, NotFoundError } from "./errors";
import { norm } from "./names";
import { seen } from "./spoilers";
import { mergeSources, parseSources } from "./sources";
import type { EntryKind, Player, QuestStatus, SourceInput, SpoilerLevel, StatName } from "./types";
import { itemPath, questPath, sessionPath } from "./urls";

export type QuestInput = {
  id?: string;
  name: string;
  localName?: string;
  giver?: string;
  location?: string;
  status?: QuestStatus;
  entries?: { kind: EntryKind; text: string; spoiler?: SpoilerLevel }[];
};

export type ItemInput = {
  id?: string;
  name: string;
  localName?: string;
  kind?: string;
  location?: string;
  equipped?: boolean;
  verdict?: string;
  spoiler?: SpoilerLevel;
  /** Pages its facts come from; merged into those it has, by link. */
  sources?: SourceInput[];
};

export type RecordInput = {
  playthroughId?: string;
  game?: string;
  platform?: string;
  label?: string;
  language?: string;
  playedOn?: string;
  summary: string;
  transcript: string;
  quests?: QuestInput[];
  stats?: { level?: number; values: Record<string, number>; names?: { key: string; name?: string; localName?: string }[] };
  build?: { summary?: string; mainStat?: string; targets?: Record<string, number> };
  items?: ItemInput[];
  /** Pages the player trusts for this game; merged into the game's, by link. */
  sources?: SourceInput[];
};

export type FiledQuest = {
  id: string;
  name: string;
  status: QuestStatus;
  created: boolean;
  statusBefore: QuestStatus | null;
  entries: { kind: EntryKind; spoiler: SpoilerLevel }[];
  url: string;
};
export type FiledItem = { id: string; name: string; created: boolean; equipped: boolean; spoiler: SpoilerLevel; url: string };

export type Recorded = {
  sessionId: string;
  url: string;
  playedOn: string;
  playthrough: ResolvedPlaythrough;
  quests: FiledQuest[];
  items: FiledItem[];
  stats: { id: string; level: number | null; values: Record<string, number>; newNames: StatName[] } | null;
  build: boolean;
  /** How many of the game's sources this call added or refreshed. */
  sources: number;
};

const clean = (s: string | undefined) => s?.trim() || null;

export async function record(p: Player, input: RecordInput): Promise<Recorded> {
  const transcript = input.transcript.trim();
  if (!transcript) throw new InvalidInputError("transcript: the player's words, verbatim, are required");
  const playedOn = input.playedOn ?? today();
  const d = await db();
  return d.transaction().execute(async (trx) => {
    const t = await playthroughForRecord(trx, p, input);
    const sessionId = newId();
    const at = now();
    await trx
      .insertInto("sessions")
      .values({ id: sessionId, player_id: p.id, playthrough_id: t.id, played_on: playedOn, summary: input.summary.trim(), transcript, created_at: at })
      .execute();
    if (!t.lastPlayedOn || t.lastPlayedOn < playedOn)
      await seen(trx.updateTable("playthroughs"), p, "playthroughs").set({ last_played_on: playedOn }).where("id", "=", t.id).execute();

    if (input.sources?.length) {
      const game = await seen(trx.selectFrom("games"), p, "games").select("sources").where("id", "=", t.game.id).executeTakeFirstOrThrow();
      await seen(trx.updateTable("games"), p, "games")
        .set({ sources: JSON.stringify(mergeSources(parseSources(game.sources), input.sources, playedOn)) })
        .where("id", "=", t.game.id)
        .execute();
    }

    // The same name twice in one call is one quest (or item): the second mention adds to the first.
    const quests: FiledQuest[] = [];
    for (const q of input.quests ?? []) {
      const name = q.name.trim();
      // Look-ups for a write go through the gate too: only the player's own rows, whatever their spoiler level.
      const existing = await seen(trx.selectFrom("quests"), p, "quests", "full")
        .select(["id", "name", "status"])
        .where("playthrough_id", "=", t.id)
        .where((eb) => (q.id ? eb("id", "=", q.id) : eb("norm", "=", norm(name))))
        .executeTakeFirst();
      if (q.id && !existing) throw new NotFoundError(`No quest with id ${q.id} in this playthrough`);
      const id = existing?.id ?? newId();
      const status = q.status ?? (existing?.status as QuestStatus | undefined) ?? "open";
      if (existing) {
        const patch = {
          status,
          updated_at: at,
          ...(q.localName ? { local_name: q.localName.trim() } : {}),
          ...(q.giver ? { giver: q.giver.trim() } : {}),
          ...(q.location ? { location: q.location.trim() } : {}),
        };
        await seen(trx.updateTable("quests"), p, "quests", "full").set(patch).where("id", "=", id).execute();
      } else {
        if (!name) throw new InvalidInputError("quests: every new quest needs a name");
        await trx
          .insertInto("quests")
          .values({
            id,
            player_id: p.id,
            playthrough_id: t.id,
            name,
            norm: norm(name),
            local_name: clean(q.localName),
            giver: clean(q.giver),
            location: clean(q.location),
            status,
            // A quest the player tells of is one they found (values V1).
            spoiler: "none",
            session_id: sessionId,
            created_at: at,
            updated_at: at,
          })
          .execute();
      }
      const entries = (q.entries ?? []).filter((e) => e.text.trim());
      for (const e of entries)
        await trx
          .insertInto("quest_entries")
          .values({
            id: newId(),
            player_id: p.id,
            quest_id: id,
            session_id: sessionId,
            kind: e.kind,
            text: e.text.trim(),
            spoiler: e.spoiler ?? "none",
            created_at: at,
          })
          .execute();
      const filed = entries.map((e) => ({ kind: e.kind, spoiler: e.spoiler ?? ("none" as const) }));
      const before = quests.find((x) => x.id === id);
      if (before) {
        before.status = status;
        before.entries.push(...filed);
      } else
        quests.push({
          id,
          name: existing?.name ?? name,
          status,
          created: !existing,
          statusBefore: (existing?.status as QuestStatus | undefined) ?? null,
          entries: filed,
          url: questPath(t.id, id),
        });
    }

    let stats: Recorded["stats"] = null;
    if (input.stats && Object.keys(input.stats.values).length) {
      const known = await statNames(p, t.game.id, trx);
      const newNames: StatName[] = Object.keys(input.stats.values)
        .filter((k) => !known.some((n) => n.key === k))
        .map((key) => {
          const given = input.stats!.names?.find((n) => n.key === key);
          return { key, name: given?.name?.trim() || key, localName: given?.localName?.trim() || null };
        });
      if (newNames.length)
        await seen(trx.updateTable("games"), p, "games")
          .set({ stats: JSON.stringify([...known, ...newNames]) })
          .where("id", "=", t.game.id)
          .execute();
      const id = newId();
      await trx
        .insertInto("stat_snapshots")
        .values({
          id,
          player_id: p.id,
          playthrough_id: t.id,
          session_id: sessionId,
          taken_on: playedOn,
          level: input.stats.level ?? null,
          stats: JSON.stringify(input.stats.values),
          created_at: at,
        })
        .execute();
      stats = { id, level: input.stats.level ?? null, values: input.stats.values, newNames };
    }

    let build = false;
    if (input.build && (input.build.summary || input.build.mainStat || input.build.targets)) {
      const plan = await seen(trx.selectFrom("build_plans"), p, "build_plans").selectAll().where("playthrough_id", "=", t.id).executeTakeFirst();
      const next = {
        summary: clean(input.build.summary) ?? plan?.summary ?? null,
        main_stat: clean(input.build.mainStat) ?? plan?.main_stat ?? null,
        targets: JSON.stringify(input.build.targets ?? (plan ? JSON.parse(plan.targets) : {})),
        updated_at: at,
      };
      if (plan) await seen(trx.updateTable("build_plans"), p, "build_plans").set(next).where("playthrough_id", "=", t.id).execute();
      else
        await trx
          .insertInto("build_plans")
          .values({ playthrough_id: t.id, player_id: p.id, ...next })
          .execute();
      build = true;
    }

    const items: FiledItem[] = [];
    for (const i of input.items ?? []) {
      const name = i.name.trim();
      const existing = await seen(trx.selectFrom("items"), p, "items", "full")
        .select(["id", "name", "equipped", "spoiler", "sources"])
        .where("playthrough_id", "=", t.id)
        .where((eb) => (i.id ? eb("id", "=", i.id) : eb("norm", "=", norm(name))))
        .executeTakeFirst();
      if (i.id && !existing) throw new NotFoundError(`No item with id ${i.id} in this playthrough`);
      const id = existing?.id ?? newId();
      const spoiler = i.spoiler ?? (existing?.spoiler as SpoilerLevel | undefined) ?? "none";
      const equipped = i.equipped ?? existing?.equipped === 1;
      if (existing) {
        await seen(trx.updateTable("items"), p, "items", "full")
          .set({
            equipped: equipped ? 1 : 0,
            spoiler,
            updated_at: at,
            ...(i.localName ? { local_name: i.localName.trim() } : {}),
            ...(i.kind ? { kind: i.kind.trim() } : {}),
            ...(i.location ? { location: i.location.trim() } : {}),
            ...(i.verdict ? { verdict: i.verdict.trim() } : {}),
            ...(i.sources?.length ? { sources: JSON.stringify(mergeSources(parseSources(existing.sources), i.sources, playedOn)) } : {}),
          })
          .where("id", "=", id)
          .execute();
      } else {
        if (!name) throw new InvalidInputError("items: every new item needs a name");
        await trx
          .insertInto("items")
          .values({
            id,
            player_id: p.id,
            playthrough_id: t.id,
            session_id: sessionId,
            name,
            norm: norm(name),
            local_name: clean(i.localName),
            kind: clean(i.kind),
            location: clean(i.location),
            equipped: equipped ? 1 : 0,
            verdict: clean(i.verdict),
            spoiler,
            sources: JSON.stringify(mergeSources([], i.sources ?? [], playedOn)),
            created_at: at,
            updated_at: at,
          })
          .execute();
      }
      if (!items.some((x) => x.id === id)) items.push({ id, name: existing?.name ?? name, created: !existing, equipped, spoiler, url: itemPath(t.id, id) });
    }

    return { sessionId, url: sessionPath(sessionId), playedOn, playthrough: t, quests, items, stats, build, sources: input.sources?.length ?? 0 };
  });
}
