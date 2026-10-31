// The two settings of a playthrough (ADR 0016), as the tools follow them: what shows without asking, Claude only offers above it and
// never says what is there; how much Claude adds after filing.
import { beforeEach, expect, test } from "vitest";
import { correct } from "./correct";
import { itemsOf } from "./items";
import { FULL, HINT, SPOILER_ITEM, seed, type Seed } from "./testing/fixtures";
import { toolByName } from "./tools";

let s: Seed;

beforeEach(async () => {
  s = await seed();
});

const run = (name: string, args: unknown) => toolByName(name)!.run(s.a, args) as Promise<Record<string, unknown>>;
const next = (out: Record<string, unknown>) => (out.next as string[]).join("\n");
const set = (settings: { background?: "none" | "light" | "useful" | "everything"; spoilers?: "none" | "hint" | "full" }) =>
  correct(s.a, [{ what: "playthrough", id: s.liesOfP, ...settings }]);

test("at none, reads show no spoilers and tell Claude only that there is more, to offer, never what", async () => {
  const threads = await run("open_threads", { playthroughId: s.liesOfP });
  expect(JSON.stringify(threads)).not.toContain(HINT);
  expect(next(threads)).toMatch(/spoiler setting/);
  expect(next(threads)).toMatch(/offer/);
  expect(next(threads)).not.toContain(HINT);
  expect(next(threads)).not.toMatch(/\d+ (hint|spoiler)/);
  const brief = await run("briefing", { playthroughId: s.liesOfP });
  expect(JSON.stringify(brief)).not.toContain(HINT);
  expect(next(brief)).toMatch(/offer/);
});

test("the spoiler setting is what reads show by default; an explicit reveal still goes higher", async () => {
  await set({ spoilers: "hint" });
  const threads = await run("open_threads", { playthroughId: s.liesOfP });
  expect(threads.reveal).toBe("hint");
  expect(JSON.stringify(threads)).toContain(HINT);
  expect(JSON.stringify(threads)).not.toContain(FULL);
  expect(JSON.stringify(await run("briefing", { playthroughId: s.liesOfP }))).toContain(HINT);
  expect(JSON.stringify(await run("open_threads", { playthroughId: s.liesOfP, reveal: "full" }))).toContain(FULL);
  await set({ spoilers: "full" });
  const items = await run("item", { playthroughId: s.liesOfP });
  expect((items.items as { name: string }[]).map((i) => i.name)).toContain(SPOILER_ITEM);
  expect(next(await run("open_threads", { playthroughId: s.liesOfP }))).not.toMatch(/offer/);
});

test("record's next asks for background as deep as the setting, and none at none", async () => {
  const file = () =>
    run("record", { playthroughId: s.liesOfP, summary: "Found a lamp.", transcript: "Found a lamp.", items: [{ name: "Old Lamp", kind: "tool" }] });
  expect(next(await file())).not.toMatch(/addBackground/);
  await set({ background: "light" });
  expect(next(await file())).toMatch(/one line/);
  await set({ background: "everything" });
  const n = next(await file());
  expect(n).toMatch(/addBackground/);
  expect(n).toMatch(/lore/);
  expect(n).toMatch(/Old Lamp/);
});

test("correct adds background lines to a row; raising background offers to fill in what is filed", async () => {
  const lamp = (await itemsOf(s.a, s.liesOfP)).find((i) => i.name === "Puppet Saber")!.id;
  await run("correct", { changes: [{ what: "item", id: lamp, addBackground: [{ text: "Scales with Motivity." }] }] });
  expect((await itemsOf(s.a, s.liesOfP)).find((i) => i.id === lamp)!.background.map((l) => l.text)).toEqual(["Scales with Motivity."]);
  const raised = await run("correct", { changes: [{ what: "playthrough", id: s.liesOfP, background: "useful" }] });
  expect(next(raised)).toMatch(/already in the book/);
  const lowered = await run("correct", { changes: [{ what: "playthrough", id: s.liesOfP, background: "none" }] });
  expect(next(lowered)).not.toMatch(/already in the book/);
});
