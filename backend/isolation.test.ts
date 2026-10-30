// One log per player (values V2): player B never sees player A's data through any read path, counts and summaries included, and can't
// write into it. Every read path the backend has is called here as B on A's ids, and as B without ids.
import { beforeEach, expect, test } from "vitest";
import { briefing } from "./briefing";
import { buildOf } from "./builds";
import { db } from "./db/testing";
import { NotFoundError } from "./errors";
import { findPlaythrough, getPlaythrough, listPlaythroughs, statNames } from "./games";
import { itemsOf } from "./items";
import { deletePlayerLog } from "./players";
import { questsOf } from "./quests";
import { record } from "./record";
import { getSession, sessionsOf } from "./sessions";
import { seen } from "./spoilers";
import { A_FIRST, A_SECOND, seed, type Seed } from "./testing/fixtures";
import { TOOLS, toolByName } from "./tools";

let s: Seed;

beforeEach(async () => {
  s = await seed();
});

// What of A's may never show up in anything B gets.
const A_WORDS = ["Lies of P", "Venigni", "Antonia", "Polendina", "Eugenie", "Puppet Saber", "motivity", A_FIRST, A_SECOND];
const clean = (x: unknown) => {
  const out = JSON.stringify(x);
  for (const w of A_WORDS) expect(out).not.toContain(w);
  for (const id of [s.liesOfP, s.venigni, s.antonia, s.first, s.second]) expect(out).not.toContain(id);
};

test("B's lists hold only B's playthroughs, sessions, quests and items", async () => {
  const mine = await listPlaythroughs(s.b);
  expect(mine.map((t) => t.game.title)).toEqual(["Elden Ring"]);
  clean(mine);
  clean(await sessionsOf(s.b, s.eldenRing));
  clean(await questsOf(s.b, s.eldenRing, { reveal: "full" }));
  clean(await itemsOf(s.b, s.eldenRing, { reveal: "full" }));
  clean(await buildOf(s.b, s.eldenRing));
});

test("A's ids don't exist for B, on every read that takes one", async () => {
  const reads = [
    () => getPlaythrough(s.b, s.liesOfP),
    () => questsOf(s.b, s.liesOfP, { reveal: "full" }),
    () => itemsOf(s.b, s.liesOfP, { reveal: "full" }),
    () => buildOf(s.b, s.liesOfP),
    () => sessionsOf(s.b, s.liesOfP),
    () => getSession(s.b, s.first),
    () => briefing(s.b, { playthroughId: s.liesOfP }),
    () => findPlaythrough(s.b, { playthroughId: s.liesOfP }),
  ];
  for (const read of reads) await expect(read()).rejects.toBeInstanceOf(NotFoundError);
});

test("naming A's game finds nothing for B, and the briefing's summary of other playthroughs is B's own", async () => {
  expect(await findPlaythrough(s.b, { game: "Lies of P" })).toBeNull();
  const b = await briefing(s.b, { game: "Lies of P" });
  expect(b.playthrough).toBeNull();
  clean(b);
  const mine = await briefing(s.b);
  expect(mine.playthrough?.game.title).toBe("Elden Ring");
  expect(mine.others).toEqual([]);
  clean(mine);
});

test("A game's stat names are its player's", async () => {
  const a = await getPlaythrough(s.a, s.liesOfP);
  expect((await statNames(s.a, a.game.id)).map((n) => n.key)).toEqual(["vitality", "motivity"]);
  expect(await statNames(s.b, a.game.id)).toEqual([]);
});

test("every tool, as B, returns nothing of A's: with A's ids it is not found, without ids it is B's own", async () => {
  for (const t of TOOLS.filter((x) => x.annotations.readOnlyHint)) {
    // missed reads only when asked; ask for everything, so nothing is held back by the spoiler gate here.
    const ask = t.name === "missed" ? { reveal: "full" } : t.name === "item" ? { reveal: "full", name: "" } : {};
    await expect(t.run(s.b, { ...ask, playthroughId: s.liesOfP })).rejects.toBeInstanceOf(NotFoundError);
    clean(await t.run(s.b, ask));
    clean(await t.run(s.b, { ...ask, game: "Lies of P" }));
  }
  const named = await toolByName("item")!.run(s.b, { name: "Puppet Saber" });
  expect(named.items).toEqual([]);
});

test("B can't correct or remove anything of A's: every target with A's id is not found, and A's log is as it was", async () => {
  const brief = await briefing(s.a, { playthroughId: s.liesOfP });
  const before = JSON.stringify([brief, await questsOf(s.a, s.liesOfP, { reveal: "full" }), await itemsOf(s.a, s.liesOfP, { reveal: "full" })]);
  const item = (await itemsOf(s.a, s.liesOfP))[0].id;
  const entry = brief.openQuests[0].entries[0].id;
  const targets = [
    { what: "game", id: brief.playthrough!.game.id },
    { what: "playthrough", id: s.liesOfP },
    { what: "session", id: s.first },
    { what: "quest", id: s.venigni },
    { what: "entry", id: entry },
    { what: "snapshot", id: brief.build.current!.id },
    { what: "item", id: item },
  ];
  for (const t of targets) await expect(toolByName("correct")!.run(s.b, { changes: [{ ...t, remove: true }] })).rejects.toBeInstanceOf(NotFoundError);
  await expect(toolByName("correct")!.run(s.b, { changes: [{ what: "quest", id: s.ranni, mergeInto: s.venigni }] })).rejects.toBeInstanceOf(NotFoundError);
  const after = await briefing(s.a, { playthroughId: s.liesOfP });
  expect(JSON.stringify([after, await questsOf(s.a, s.liesOfP, { reveal: "full" }), await itemsOf(s.a, s.liesOfP, { reveal: "full" })])).toBe(before);
});

test("B can't record into A's playthrough or A's quests; the same title makes B a game of B's own", async () => {
  const before = await questsOf(s.a, s.liesOfP, { reveal: "full" });
  await expect(record(s.b, { playthroughId: s.liesOfP, summary: "x", transcript: "x" })).rejects.toBeInstanceOf(NotFoundError);
  await expect(
    record(s.b, { playthroughId: s.eldenRing, summary: "x", transcript: "x", quests: [{ id: s.venigni, name: "Venigni's Workers", status: "done" }] }),
  ).rejects.toBeInstanceOf(NotFoundError);
  const r = await toolByName("record")!.run(s.b, {
    game: "Lies of P",
    summary: "Started Lies of P",
    transcript: "I started Lies of P too.",
    quests: [{ name: "Venigni's Workers" }],
  });
  expect((r.playthrough as { id: string }).id).not.toBe(s.liesOfP);
  expect(r.quests).toEqual([expect.objectContaining({ created: true })]);
  // A's log is as it was.
  expect(await questsOf(s.a, s.liesOfP, { reveal: "full" })).toEqual(before);
  expect((await listPlaythroughs(s.a)).map((t) => t.game.title)).toEqual(["Lies of P"]);
});

test("counts through the gate are per player", async () => {
  const d = await db();
  const n = async (p: typeof s.a, table: "quests" | "items" | "sessions" | "stat_snapshots") =>
    (
      await seen(d.selectFrom(table), p, table, "full")
        .select((eb) => eb.fn.countAll<number>().as("n"))
        .executeTakeFirstOrThrow()
    ).n;
  expect([await n(s.b, "quests"), await n(s.b, "items"), await n(s.b, "sessions"), await n(s.b, "stat_snapshots")]).toEqual([1, 1, 1, 0]);
  expect([await n(s.a, "quests"), await n(s.a, "items"), await n(s.a, "sessions"), await n(s.a, "stat_snapshots")]).toEqual([4, 2, 2, 2]);
});

test("deleting a player's log leaves the other's untouched", async () => {
  await deletePlayerLog(s.a);
  const d = await db();
  for (const table of ["games", "playthroughs", "sessions", "quests", "quest_entries", "build_plans", "stat_snapshots", "items"] as const)
    expect(await d.selectFrom(table).select("player_id").where("player_id", "=", s.a.id).execute()).toEqual([]);
  expect((await listPlaythroughs(s.b)).map((t) => t.game.title)).toEqual(["Elden Ring"]);
  expect(await questsOf(s.b, s.eldenRing)).toHaveLength(1);
});
