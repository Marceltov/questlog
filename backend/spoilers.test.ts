// The spoiler gate (values V1): nothing the player hasn't found reaches a read that didn't ask for it, through any read path; asking
// shows exactly the levels asked for.
import { beforeEach, expect, test } from "vitest";
import { briefing } from "./briefing";
import { db } from "./db/testing";
import { itemsOf } from "./items";
import { questsOf } from "./quests";
import { seen, shown } from "./spoilers";
import { buildOf } from "./builds";
import { goalsOf } from "./goals";
import { record } from "./record";
import { FULL, HINT, SPOILER_ITEM, SPOILER_SOURCE, seed, type Seed } from "./testing/fixtures";
import { toolByName } from "./tools";

let s: Seed;

beforeEach(async () => {
  s = await seed();
});

const texts = (qs: Awaited<ReturnType<typeof questsOf>>) => qs.flatMap((q) => q.entries.map((e) => e.text));

test("the levels a read may show grow with what it asks for", () => {
  expect(shown("none")).toEqual(["none"]);
  expect(shown("hint")).toEqual(["none", "hint"]);
  expect(shown("full")).toEqual(["none", "hint", "full"]);
});

test("seen() hides hint and full rows by default, counts included", async () => {
  const d = await db();
  const count = async (reveal?: "none" | "hint" | "full") =>
    (
      await seen(d.selectFrom("quest_entries"), s.a, "quest_entries", reveal)
        .select((eb) => eb.fn.countAll<number>().as("n"))
        .executeTakeFirstOrThrow()
    ).n;
  const all = (
    await d
      .selectFrom("quest_entries")
      .select((eb) => eb.fn.countAll<number>().as("n"))
      .where("player_id", "=", s.a.id)
      .executeTakeFirstOrThrow()
  ).n;
  expect(await count()).toBe(all - 2);
  expect(await count("hint")).toBe(all - 1);
  expect(await count("full")).toBe(all);
});

test("a quest read shows only what the player found unless it asks", async () => {
  const quiet = await questsOf(s.a, s.liesOfP);
  expect(texts(quiet)).not.toContain(HINT);
  expect(texts(quiet)).not.toContain(FULL);
  // The next step falls back to the last one the player found.
  expect(quiet.find((q) => q.id === s.venigni)!.nextStep).toBe("Look for the workers");

  const hint = await questsOf(s.a, s.liesOfP, { reveal: "hint" });
  expect(texts(hint)).toContain(HINT);
  expect(texts(hint)).not.toContain(FULL);
  expect(hint.find((q) => q.id === s.venigni)!.nextStep).toBe(HINT);

  expect(texts(await questsOf(s.a, s.liesOfP, { reveal: "full" }))).toEqual(expect.arrayContaining([HINT, FULL]));
});

test("an item marked as a spoiler stays out of item lists unless asked for", async () => {
  expect((await itemsOf(s.a, s.liesOfP)).map((i) => i.name)).toEqual(["Puppet Saber"]);
  expect((await itemsOf(s.a, s.liesOfP, { reveal: "full" })).map((i) => i.name)).toContain(SPOILER_ITEM);
});

test("a briefing never contains a spoiler, in its data or its next", async () => {
  const out = JSON.stringify(await toolByName("briefing")!.run(s.a, { playthroughId: s.liesOfP }));
  for (const secret of [HINT, FULL, SPOILER_ITEM]) expect(out).not.toContain(secret);
  const b = await briefing(s.a, { playthroughId: s.liesOfP });
  expect(JSON.stringify(b)).not.toContain(HINT);
});

test("open_threads shows hints only when asked, and says so in next", async () => {
  const run = (reveal?: string) => toolByName("open_threads")!.run(s.a, { playthroughId: s.liesOfP, ...(reveal ? { reveal } : {}) });
  const quiet = JSON.stringify(await run());
  expect(quiet).not.toContain(HINT);
  expect(quiet).not.toContain(FULL);
  const hint = await run("hint");
  expect(JSON.stringify(hint)).toContain(HINT);
  expect(JSON.stringify(hint)).not.toContain(FULL);
  expect((hint.next as string[]).join(" ")).toMatch(/asked for hints/);
  expect(JSON.stringify(await run("full"))).toContain(FULL);
});

test("a quest the player tells of is stored as found, whatever a caller sends", async () => {
  const d = await db();
  const levels = await d.selectFrom("quests").select("spoiler").distinct().execute();
  expect(levels).toEqual([{ spoiler: "none" }]);
});

test("item shows spoiler items only when asked, and missed only at the level asked", async () => {
  const quiet = JSON.stringify(await toolByName("item")!.run(s.a, { playthroughId: s.liesOfP }));
  expect(quiet).not.toContain(SPOILER_ITEM);
  expect(JSON.stringify(await toolByName("item")!.run(s.a, { playthroughId: s.liesOfP, reveal: "full" }))).toContain(SPOILER_ITEM);
  const hint = JSON.stringify(await toolByName("missed")!.run(s.a, { playthroughId: s.liesOfP, reveal: "hint" }));
  expect(hint).toContain(HINT);
  expect(hint).not.toContain(FULL);
  expect(hint).not.toContain(SPOILER_ITEM);
});

test("correct reads back names and days, never the text of an entry it changed", async () => {
  const [hinted] = (await questsOf(s.a, s.liesOfP, { reveal: "hint" })).flatMap((q) => q.entries.filter((e) => e.text === HINT));
  const out = JSON.stringify(await toolByName("correct")!.run(s.a, { changes: [{ what: "entry", id: hinted.id, kind: "log" }] }));
  expect(out).not.toContain(HINT);
});

test("an item's sources stay hidden with the item; the game's sources are shown", async () => {
  const quiet = JSON.stringify(await toolByName("item")!.run(s.a, { playthroughId: s.liesOfP }));
  expect(quiet).not.toContain(SPOILER_SOURCE);
  expect(quiet).toContain("Lies Wiki");
  expect(JSON.stringify(await toolByName("briefing")!.run(s.a, { playthroughId: s.liesOfP }))).not.toContain(SPOILER_SOURCE);
  expect(JSON.stringify(await toolByName("item")!.run(s.a, { playthroughId: s.liesOfP, reveal: "full" }))).toContain(SPOILER_SOURCE);
});

test("a goal marked as a spoiler stays out of the build, the briefing and its next unless asked for", async () => {
  await record(s.a, {
    playthroughId: s.liesOfP,
    summary: "Planned.",
    transcript: "What should I aim for?",
    goals: [{ kind: "note", text: HINT, suggested: true, spoiler: "hint" }],
  });
  expect(JSON.stringify(await buildOf(s.a, s.liesOfP))).not.toContain(HINT);
  expect(JSON.stringify(await toolByName("briefing")!.run(s.a, { playthroughId: s.liesOfP }))).not.toContain(HINT);
  expect((await goalsOf(s.a, s.liesOfP, { reveal: "hint" })).map((g) => g.text)).toContain(HINT);
});
