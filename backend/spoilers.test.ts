// The spoiler gate (values V1): nothing the player hasn't found reaches a read that didn't ask for it, through any read path; asking
// shows exactly the levels asked for.
import { beforeEach, expect, test } from "vitest";
import { briefing } from "./briefing";
import { db } from "./db/testing";
import { itemsOf } from "./items";
import { questsOf } from "./quests";
import { seen, shown } from "./spoilers";
import { FULL, HINT, SPOILER_ITEM, seed, type Seed } from "./testing/fixtures";
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
