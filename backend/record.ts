// Filing a play session: the transcript as the player said it (values V3), and what was filed from it: quest entries, a stat snapshot,
// the build plan, goals, the codex (bosses, enemies, NPCs, places) and items. One transaction; everything points to the session. Quests and items are matched by id or by their exact name
// in the playthrough, never by a guess (values V4).
import { db, newId, now } from "./db";
import { today } from "./dates";
import { fileItemKind, itemKindsOf, playthroughForRecord, setItemKinds, statNames, type ItemKindInput, type ResolvedPlaythrough } from "./games";
import { writeCodex, writeUses, type AgainstInput, type CodexInput, type FiledCodex } from "./codex";
import { carryGoals, goalLabel, reachGoals, writeGoals, type FiledGoal, type GoalInput } from "./goals";
import type { Transaction } from "kysely";
import type { Schema } from "./db/schema";
import { InvalidInputError, NotFoundError } from "./errors";
import { norm } from "./names";
import { addNote } from "./notes";
import { seen } from "./spoilers";
import { addBackground, type BackgroundInput } from "./background";
import { setTags } from "./tags";
import { mergeSources, parseSources } from "./sources";
import type { Attributes, EntryKind, GoalKind, ItemKind, Player, QuestStatus, SourceInput, SpoilerLevel, StatName } from "./types";
import { itemPath, questPath, sessionPath } from "./urls";

export type QuestInput = {
  id?: string;
  name: string;
  localName?: string;
  giver?: string;
  /** Its tags by name (ADR 0014): replaces those it has; left out keeps them. */
  tags?: string[];
  /** Background Claude adds about it (ADR 0016), each line with its spoiler level; added to the lines it has. */
  background?: BackgroundInput[];
  location?: string;
  status?: QuestStatus;
  /** What the quest is about, as the game puts it; replaces the one it has. */
  description?: string;
  /** The player's own thoughts, added to its notes. */
  notes?: string;
  entries?: { kind: EntryKind; text: string; spoiler?: SpoilerLevel }[];
};

export type ItemInput = {
  id?: string;
  name: string;
  localName?: string;
  /** What it is, as the game describes it; replaces the one it has. */
  description?: string;
  /** The player's own thoughts, added to its notes. */
  notes?: string;
  kind?: string;
  location?: string;
  equipped?: boolean;
  verdict?: string;
  spoiler?: SpoilerLevel;
  /** Pages its facts come from; merged into those it has, by link. */
  sources?: SourceInput[];
  /** Its tags by name (ADR 0014): replaces those it has; left out keeps them. */
  tags?: string[];
  /** Background Claude adds about it (ADR 0016), each line with its spoiler level; added to the lines it has. */
  background?: BackgroundInput[];
  /** How many the player has now. */
  quantity?: number;
  /** Its numbers, by the game's names; merged into those it has. */
  attributes?: Attributes;
  /** Codex entries it is good (the default) or bad against, by id or exact name, with how. */
  against?: AgainstInput[];
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
  stats?: { level?: number; values: Record<string, number>; names?: { key: string; name?: string; localName?: string }[]; notes?: string };
  /** Names the game's inventory groups: a group named by key gets the names, a new one goes at the end. */
  itemKinds?: ItemKindInput[];
  /** `targets` is short for stat goals of the player's: { vigor: 20 }. */
  build?: { summary?: string; mainStat?: string; targets?: Record<string, number> };
  goals?: GoalInput[];
  /** Bosses, enemies, NPCs and places met or learned about in this session. */
  codex?: CodexInput[];
  /** Who the player plays in this run; only the fields given change. */
  character?: { name?: string; class?: string; localClass?: string };
  /** For a new playthrough (NG+): the run to take the character, the build plan and the open goals from. */
  carryFrom?: string;
  items?: ItemInput[];
  /** Pages the player trusts for this game; merged into the game's, by link. */
  sources?: SourceInput[];
  /** The player's own thoughts on the game, this run or this session, each added to its notes (ADR 0011). */
  notes?: { game?: string; playthrough?: string; session?: string };
  /** What the game is; replaces the one it has. */
  gameDescription?: string;
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
  /** Inventory groups this call added to the game, by an item's new kind or by itemKinds. */
  newItemKinds: ItemKind[];
  /** Tags this call made for the game (ADR 0014). */
  newTags: string[];
  stats: { id: string; level: number | null; values: Record<string, number>; newNames: StatName[] } | null;
  build: boolean;
  goals: FiledGoal[];
  codex: FiledCodex[];
  /** Labels of the goals this session's snapshot got to. */
  reached: string[];
  character: boolean;
  /** How many open goals came along from carryFrom; null when nothing was carried. */
  carried: number | null;
  /** How many of the game's sources this call added or refreshed. */
  sources: number;
};

const clean = (s: string | undefined) => s?.trim() || null;

async function characterOf(trx: Transaction<Schema>, p: Player, id: string) {
  const r = await seen(trx.selectFrom("playthroughs"), p, "playthroughs")
    .select(["character_name", "character_class", "character_local_class"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
  return { character: { name: r.character_name, class: r.character_class, localClass: r.character_local_class } };
}

// A goal reached that this call didn't name: its label from its row.
async function reachedLabel(trx: Transaction<Schema>, p: Player, id: string, gameId: string) {
  const g = await seen(trx.selectFrom("goals"), p, "goals", "full").select(["kind", "stat", "target"]).where("id", "=", id).executeTakeFirstOrThrow();
  const names = await statNames(p, gameId, trx);
  const stat = g.stat ? (names.find((n) => n.key === g.stat) ?? { key: g.stat, name: g.stat, localName: null }) : null;
  return goalLabel({ kind: g.kind as GoalKind, stat, target: g.target, item: null, text: null });
}

export async function record(p: Player, input: RecordInput): Promise<Recorded> {
  const transcript = input.transcript.trim();
  if (!transcript) throw new InvalidInputError("transcript: the player's words, verbatim, are required");
  const playedOn = input.playedOn ?? today();
  const d = await db();
  return d.transaction().execute(async (trx) => {
    const t = await playthroughForRecord(trx, p, input);
    if (input.carryFrom && !t.createdPlaythrough)
      throw new InvalidInputError("carryFrom: only for a new playthrough; pass the game and a new label (e.g. NG+) with it");
    const sessionId = newId();
    const at = now();
    await trx
      .insertInto("sessions")
      .values({
        id: sessionId,
        player_id: p.id,
        playthrough_id: t.id,
        played_on: playedOn,
        summary: input.summary.trim(),
        transcript,
        notes: addNote(null, input.notes?.session),
        created_at: at,
      })
      .execute();

    let carried: number | null = null;
    if (input.carryFrom) {
      const from = await seen(trx.selectFrom("playthroughs"), p, "playthroughs")
        .select(["id", "game_id", "character_name", "character_class", "character_local_class"])
        .where("id", "=", input.carryFrom)
        .executeTakeFirst();
      if (!from || from.game_id !== t.game.id) throw new NotFoundError(`carryFrom: no playthrough with id ${input.carryFrom} of ${t.game.title}`);
      await seen(trx.updateTable("playthroughs"), p, "playthroughs")
        .set({ character_name: from.character_name, character_class: from.character_class, character_local_class: from.character_local_class })
        .where("id", "=", t.id)
        .execute();
      const plan = await seen(trx.selectFrom("build_plans"), p, "build_plans").selectAll().where("playthrough_id", "=", from.id).executeTakeFirst();
      if (plan)
        await trx
          .insertInto("build_plans")
          .values({ playthrough_id: t.id, player_id: p.id, summary: plan.summary, main_stat: plan.main_stat, updated_at: at })
          .execute();
      carried = await carryGoals(trx, p, from.id, t.id, sessionId);
    }

    const character = input.character && Object.values(input.character).some((v) => v?.trim());
    if (character)
      await seen(trx.updateTable("playthroughs"), p, "playthroughs")
        .set({
          ...(input.character!.name?.trim() ? { character_name: input.character!.name.trim() } : {}),
          ...(input.character!.class?.trim() ? { character_class: input.character!.class.trim() } : {}),
          ...(input.character!.localClass?.trim() ? { character_local_class: input.character!.localClass.trim() } : {}),
        })
        .where("id", "=", t.id)
        .execute();
    if (!t.lastPlayedOn || t.lastPlayedOn < playedOn)
      await seen(trx.updateTable("playthroughs"), p, "playthroughs").set({ last_played_on: playedOn }).where("id", "=", t.id).execute();

    if (input.sources?.length || input.notes?.game?.trim() || input.gameDescription?.trim()) {
      const game = await seen(trx.selectFrom("games"), p, "games").select(["sources", "notes"]).where("id", "=", t.game.id).executeTakeFirstOrThrow();
      await seen(trx.updateTable("games"), p, "games")
        .set({
          ...(input.sources?.length ? { sources: JSON.stringify(mergeSources(parseSources(game.sources), input.sources, playedOn)) } : {}),
          notes: addNote(game.notes, input.notes?.game),
          ...(input.gameDescription?.trim() ? { description: input.gameDescription.trim() } : {}),
        })
        .where("id", "=", t.game.id)
        .execute();
    }
    if (input.notes?.playthrough?.trim()) {
      const run = await seen(trx.selectFrom("playthroughs"), p, "playthroughs").select("notes").where("id", "=", t.id).executeTakeFirstOrThrow();
      await seen(trx.updateTable("playthroughs"), p, "playthroughs")
        .set({ notes: addNote(run.notes, input.notes.playthrough) })
        .where("id", "=", t.id)
        .execute();
    }

    // The same name twice in one call is one quest (or item): the second mention adds to the first.
    const quests: FiledQuest[] = [];
    const newTags: string[] = [];
    for (const q of input.quests ?? []) {
      const name = q.name.trim();
      // Look-ups for a write go through the gate too: only the player's own rows, whatever their spoiler level.
      const existing = await seen(trx.selectFrom("quests"), p, "quests", "full")
        .select(["id", "name", "status", "notes"])
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
          ...(q.description?.trim() ? { description: q.description.trim() } : {}),
          notes: addNote(existing.notes, q.notes),
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
            description: clean(q.description),
            notes: addNote(null, q.notes),
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
      if (q.tags) newTags.push(...(await setTags(trx, p, t.game.id, "quest", id, q.tags)));
      if (q.background) await addBackground(trx, p, "quest", id, q.background);
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
          notes: addNote(null, input.stats.notes),
          created_at: at,
        })
        .execute();
      stats = { id, level: input.stats.level ?? null, values: input.stats.values, newNames };
    }

    let build = false;
    if (input.build && (input.build.summary || input.build.mainStat)) {
      const plan = await seen(trx.selectFrom("build_plans"), p, "build_plans").selectAll().where("playthrough_id", "=", t.id).executeTakeFirst();
      const next = {
        summary: clean(input.build.summary) ?? plan?.summary ?? null,
        main_stat: clean(input.build.mainStat) ?? plan?.main_stat ?? null,
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

    const codex = input.codex?.length ? await writeCodex(trx, p, t.id, sessionId, playedOn, input.codex) : [];
    // writeCodex files one entry per input, in order.
    for (const [n, c] of (input.codex ?? []).entries()) {
      if (c.tags) newTags.push(...(await setTags(trx, p, t.game.id, "codex", codex[n].id, c.tags)));
      if (c.background) await addBackground(trx, p, "codex", codex[n].id, c.background);
    }

    const kindsBefore = t.game.itemKinds.map((k) => k.key);
    if (input.itemKinds?.length) await setItemKinds(trx, p, t.game.id, input.itemKinds, "merge");
    const items: FiledItem[] = [];
    for (const i of input.items ?? []) {
      const kind = i.kind?.trim() ? (await fileItemKind(trx, p, t.game.id, i.kind)).key : null;
      if (i.quantity !== undefined && (!Number.isInteger(i.quantity) || i.quantity < 0)) throw new InvalidInputError("items: quantity is a count, 0 or more");
      const name = i.name.trim();
      const existing = await seen(trx.selectFrom("items"), p, "items", "full")
        .select(["id", "name", "equipped", "spoiler", "sources", "attributes", "notes"])
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
            ...(i.description?.trim() ? { description: i.description.trim() } : {}),
            notes: addNote(existing.notes, i.notes),
            ...(kind ? { kind } : {}),
            ...(i.location ? { location: i.location.trim() } : {}),
            ...(i.verdict ? { verdict: i.verdict.trim() } : {}),
            ...(i.sources?.length ? { sources: JSON.stringify(mergeSources(parseSources(existing.sources), i.sources, playedOn)) } : {}),
            ...(i.quantity !== undefined ? { quantity: i.quantity } : {}),
            ...(i.attributes ? { attributes: JSON.stringify({ ...(JSON.parse(existing.attributes) as Attributes), ...i.attributes }) } : {}),
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
            description: clean(i.description),
            notes: addNote(null, i.notes),
            kind,
            location: clean(i.location),
            equipped: equipped ? 1 : 0,
            verdict: clean(i.verdict),
            spoiler,
            sources: JSON.stringify(mergeSources([], i.sources ?? [], playedOn)),
            quantity: i.quantity ?? null,
            attributes: JSON.stringify(i.attributes ?? {}),
            created_at: at,
            updated_at: at,
          })
          .execute();
      }
      if (i.against?.length) await writeUses(trx, p, t.id, id, i.against);
      if (i.tags) newTags.push(...(await setTags(trx, p, t.game.id, "item", id, i.tags)));
      if (i.background) await addBackground(trx, p, "item", id, i.background);
      if (!items.some((x) => x.id === id)) items.push({ id, name: existing?.name ?? name, created: !existing, equipped, spoiler, url: itemPath(t.id, id) });
    }

    // After the snapshot (a new stat's key) and the items (an item goal's item). The build's targets are stat goals of the player's.
    const goalInputs: GoalInput[] = [
      ...Object.entries(input.build?.targets ?? {}).map(([stat, target]) => ({ kind: "stat" as const, stat, target })),
      ...(input.goals ?? []),
    ];
    const goals = goalInputs.length ? await writeGoals(trx, p, { id: t.id, gameId: t.game.id }, sessionId, goalInputs) : [];
    const reachedIds = await reachGoals(trx, p, t.id);
    const reached: string[] = [];
    for (const id of reachedIds) {
      const g = goals.find((x) => x.id === id);
      if (g) g.status = "reached";
      reached.push(g?.label ?? (await reachedLabel(trx, p, id, t.game.id)));
    }

    const itemKinds = await itemKindsOf(p, t.game.id, trx);
    return {
      sessionId,
      url: sessionPath(sessionId),
      playedOn,
      playthrough: { ...t, game: { ...t.game, itemKinds }, ...(character || carried !== null ? await characterOf(trx, p, t.id) : {}) },
      quests,
      items,
      newItemKinds: itemKinds.filter((k) => !kindsBefore.includes(k.key)),
      newTags: [...new Set(newTags)],
      stats,
      build: build || goals.length > 0,
      goals,
      codex,
      reached,
      character: !!character || carried !== null,
      carried,
      sources: input.sources?.length ?? 0,
    };
  });
}
