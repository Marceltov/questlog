// Background lines (ADR 0016): what Claude adds about an item, a codex entry or a quest, each line with its own spoiler level and source.
import { beforeEach, expect, test } from "vitest";
import { addBackground } from "./background";
import { codexOf } from "./codex";
import { correct } from "./correct";
import { db } from "./db/testing";
import { NotFoundError } from "./errors";
import { itemsOf } from "./items";
import { questsOf } from "./quests";
import { record } from "./record";
import { seed, type Seed } from "./testing/fixtures";

let s: Seed;

beforeEach(async () => {
  s = await seed();
});

const saber = async () => (await itemsOf(s.a, s.liesOfP)).find((i) => i.name === "Puppet Saber")!.id;
const add = async (what: "item" | "codex" | "quest", id: string, lines: Parameters<typeof addBackground>[4], p = s.a) =>
  (await db()).transaction().execute((trx) => addBackground(trx, p, what, id, lines));
const texts = (lines: { text: string }[]) => lines.map((l) => l.text);

test("a line shows only as far as the read reveals, even on a row everyone sees", async () => {
  const item = await saber();
  await add("item", item, [
    { text: "A light blade that scales with Motivity.", spoiler: "none", source: { url: "https://wiki.example/saber", title: "Wiki" } },
    { text: "It belonged to a puppet in Krat's old factory.", spoiler: "hint" },
    { text: "Its maker turns on Geppetto at the end.", spoiler: "full" },
  ]);
  const at = async (reveal: "none" | "hint" | "full") => texts((await itemsOf(s.a, s.liesOfP, { reveal })).find((i) => i.id === item)!.background);
  expect(await at("none")).toEqual(["A light blade that scales with Motivity."]);
  expect(await at("hint")).toHaveLength(2);
  expect(await at("full")).toHaveLength(3);
  const [first] = (await itemsOf(s.a, s.liesOfP)).find((i) => i.id === item)!.background;
  expect(first).toEqual({
    id: expect.any(String),
    text: "A light blade that scales with Motivity.",
    spoiler: "none",
    source: { url: "https://wiki.example/saber", title: "Wiki" },
  });
});

test("a line already there isn't added twice; quests and codex entries carry lines too", async () => {
  await add("quest", s.venigni, [{ text: "Venigni runs the Workshop Union.", spoiler: "none" }]);
  await add("quest", s.venigni, [
    { text: "Venigni runs the Workshop Union.", spoiler: "none" },
    { text: "His factory is in the north.", spoiler: "none" },
  ]);
  expect(texts((await questsOf(s.a, s.liesOfP)).find((q) => q.id === s.venigni)!.background)).toEqual([
    "Venigni runs the Workshop Union.",
    "His factory is in the north.",
  ]);
  await record(s.a, {
    playthroughId: s.liesOfP,
    summary: "Met the Parade Master.",
    transcript: "Met the Parade Master.",
    codex: [{ kind: "boss", name: "Parade Master" }],
  });
  const boss = (await codexOf(s.a, s.liesOfP)).find((e) => e.name === "Parade Master")!.id;
  await add("codex", boss, [{ text: "Weak to electric blitz.", spoiler: "none" }]);
  expect(texts((await codexOf(s.a, s.liesOfP)).find((e) => e.id === boss)!.background)).toEqual(["Weak to electric blitz."]);
});

test("a deleted row takes its lines along; another player's row can't get any", async () => {
  const item = await saber();
  await add("item", item, [{ text: "Scales with Motivity.", spoiler: "none" }]);
  await correct(s.a, [{ what: "item", id: item, remove: true }]);
  expect(await (await db()).selectFrom("background").selectAll().execute()).toEqual([]);
  await expect(add("quest", s.ranni, [{ text: "x", spoiler: "none" }])).rejects.toThrow(NotFoundError);
});

test("record files background on items, codex entries and quests, with spoiler levels and sources", async () => {
  await record(s.a, {
    playthroughId: s.liesOfP,
    summary: "Got a saber and met the Parade Master.",
    transcript: "Got a saber and met the Parade Master.",
    items: [{ name: "Puppet Saber", background: [{ text: "Scales with Motivity.", source: { url: "https://wiki.example/saber", title: "Wiki" } }] }],
    codex: [{ kind: "boss", name: "Parade Master", background: [{ text: "Its rider falls in phase two.", spoiler: "full" }] }],
    quests: [{ id: s.venigni, name: "Venigni's Request", background: [{ text: "Venigni runs the Workshop Union.", spoiler: "none" }] }],
  });
  expect(texts((await itemsOf(s.a, s.liesOfP)).find((i) => i.name === "Puppet Saber")!.background)).toEqual(["Scales with Motivity."]);
  expect((await codexOf(s.a, s.liesOfP)).find((e) => e.name === "Parade Master")!.background).toEqual([]);
  expect(texts((await codexOf(s.a, s.liesOfP, { reveal: "full" })).find((e) => e.name === "Parade Master")!.background)).toEqual([
    "Its rider falls in phase two.",
  ]);
  expect(texts((await questsOf(s.a, s.liesOfP)).find((q) => q.id === s.venigni)!.background)).toEqual(["Venigni runs the Workshop Union."]);
});

test("correct sets a playthrough's settings, and fixes or removes a line; another player's isn't found", async () => {
  const { getPlaythrough } = await import("./games");
  expect((await getPlaythrough(s.a, s.liesOfP)).settings).toEqual({ background: "none", spoilers: "none" });
  await correct(s.a, [{ what: "playthrough", id: s.liesOfP, background: "useful", spoilers: "hint" }]);
  expect((await getPlaythrough(s.a, s.liesOfP)).settings).toEqual({ background: "useful", spoilers: "hint" });

  const item = await saber();
  const [id] = await add("item", item, [{ text: "Scales with Motivty.", spoiler: "none" }]);
  await correct(s.a, [
    { what: "background", id, text: "Scales with Motivity.", spoiler: "hint", source: { url: "https://wiki.example/saber", title: "Wiki" } },
  ]);
  expect((await itemsOf(s.a, s.liesOfP, { reveal: "hint" })).find((i) => i.id === item)!.background).toEqual([
    { id, text: "Scales with Motivity.", spoiler: "hint", source: { url: "https://wiki.example/saber", title: "Wiki" } },
  ]);
  await expect(correct(s.b, [{ what: "background", id, remove: true }])).rejects.toThrow(NotFoundError);
  await correct(s.a, [{ what: "background", id, remove: true }]);
  expect((await itemsOf(s.a, s.liesOfP, { reveal: "full" })).find((i) => i.id === item)!.background).toEqual([]);
});
