// The tracker (ADR 0010): the inventory with counts and numbers, the codex of bosses, enemies, NPCs and places, and what an item is good
// against; through the same gate as everything else.
import { beforeEach, expect, test } from "vitest";
import { briefing } from "./briefing";
import { codexOf } from "./codex";
import { correct } from "./correct";
import { AmbiguousError, InvalidInputError, NotFoundError } from "./errors";
import { itemsOf } from "./items";
import { record } from "./record";
import { getPlaythrough } from "./games";
import { HINT, SPOILER_ITEM, seed, type Seed } from "./testing/fixtures";
import { toolByName } from "./tools";

let s: Seed;

beforeEach(async () => {
  s = await seed();
});

const session = (extra: Record<string, unknown>) => ({
  playthroughId: s.liesOfP,
  summary: "Fought the Parade Master.",
  transcript: "Third try at him, no luck.",
  ...extra,
});
const next = (out: Record<string, unknown>) => (out.next as string[]).join("\n");

const boss = {
  kind: "boss" as const,
  name: "Parade Master",
  localName: "Paradenmeister",
  location: "Krat Central Station",
  attempts: 3,
  weaknesses: ["Fire"],
  strategy: "Dodge the spin, punish after the slam",
};

test("record files a boss, a consumable with its count and what it is good against; codex shows the counter with how many are left", async () => {
  const out = await toolByName("record")!.run(
    s.a,
    session({
      codex: [boss],
      items: [{ name: "Fire Abrasive", kind: "consumable", quantity: 4, against: [{ target: "Parade Master", note: "Coat the blade before the fight" }] }],
    }),
  );
  expect(out.codex).toEqual([expect.objectContaining({ kind: "boss", name: "Parade Master", status: "met", created: true })]);
  expect(next(out)).toMatch(/New in the codex: Parade Master \(boss\)/);
  const looked = await toolByName("codex")!.run(s.a, { playthroughId: s.liesOfP, name: "parade" });
  const [entry] = looked.entries as {
    name: string;
    weaknesses: string[];
    attempts: number;
    counters: { item: { name: string; quantity: number }; note: string }[];
  }[];
  expect(entry).toMatchObject({ name: "Parade Master", weaknesses: ["Fire"], attempts: 3 });
  expect(entry.counters).toEqual([
    { item: expect.objectContaining({ name: "Fire Abrasive", quantity: 4 }), effect: "good", note: "Coat the blade before the fight" },
  ]);
  const [item] = await itemsOf(s.a, s.liesOfP, { name: "fire abrasive" });
  expect(item.against).toEqual([
    { codex: expect.objectContaining({ name: "Parade Master", kind: "boss" }), effect: "good", note: "Coat the blade before the fight" },
  ]);
});

test("briefing names the bosses in the way with their tries; beating one dates it and takes it off", async () => {
  await record(s.a, session({ codex: [boss] }));
  const brief = await toolByName("briefing")!.run(s.a, { playthroughId: s.liesOfP });
  expect((brief.bosses as { name: string }[]).map((b) => b.name)).toEqual(["Parade Master"]);
  expect(next(brief)).toMatch(/In the way: Parade Master \(3 tries\)/);
  const won = await toolByName("record")!.run(s.a, session({ playedOn: "2026-10-31", codex: [{ name: "Parade Master", status: "beaten", attempts: 5 }] }));
  expect(next(won)).toMatch(/Parade Master is beaten/);
  const [e] = await codexOf(s.a, s.liesOfP, { name: "Parade Master" });
  expect([e.status, e.beatenOn, e.attempts]).toEqual(["beaten", "2026-10-31", 5]);
  expect((await briefing(s.a, { playthroughId: s.liesOfP })).bosses).toEqual([]);
});

test("an item can be bad against a boss too: the codex says what to leave at home, and a later record can turn a link around", async () => {
  await record(
    s.a,
    session({
      codex: [boss],
      items: [
        { name: "Fire Abrasive", against: [{ target: "Parade Master" }] },
        { name: "Electric Blitz Abrasive", against: [{ target: "Parade Master", effect: "bad", note: "He shrugs off electricity" }] },
      ],
    }),
  );
  const [e] = await codexOf(s.a, s.liesOfP);
  expect(e.counters.map((c) => [c.item.name, c.effect, c.note])).toEqual([
    ["Fire Abrasive", "good", null],
    ["Electric Blitz Abrasive", "bad", "He shrugs off electricity"],
  ]);
  const looked = await toolByName("codex")!.run(s.a, { playthroughId: s.liesOfP, name: "parade" });
  expect(next(looked)).toMatch(/leave at home/);
  await record(s.a, session({ items: [{ name: "Fire Abrasive", against: [{ target: "Parade Master", effect: "bad" }] }] }));
  const [item] = await itemsOf(s.a, s.liesOfP, { name: "fire abrasive" });
  expect(item.against.map((a) => a.effect)).toEqual(["bad"]);
});

test("the inventory groups are the game's: a new kind adds one, the player names and orders them, and one in use can't go", async () => {
  const keys = async () => (await getPlaythrough(s.a, s.liesOfP)).game.itemKinds.map((k) => k.key);
  expect(await keys()).toEqual(["weapon", "key"]);
  const out = await toolByName("record")!.run(s.a, session({ items: [{ name: "Fire Ring", kind: "Ring" }] }));
  expect(out.newItemKinds).toEqual(["ring"]);
  expect(next(out)).toMatch(/New inventory group for Lies of P: Ring, key ring\. Check the names with the player/);
  await record(s.a, session({ itemKinds: [{ key: "ring", name: "Rings", localName: "Ringe" }], items: [{ name: "Ice Ring", kind: "Ringe" }] }));
  const [ring] = await itemsOf(s.a, s.liesOfP, { name: "ice ring" });
  expect(ring.kind).toBe("ring");
  const game = (await getPlaythrough(s.a, s.liesOfP)).game;
  expect(game.itemKinds.find((k) => k.key === "ring")).toEqual({ key: "ring", name: "Rings", localName: "Ringe" });

  await correct(s.a, [{ what: "game", id: game.id, itemKinds: [{ key: "ring" }, { key: "weapon", name: "Weapons" }, { key: "key", name: "Key items" }] }]);
  expect(await keys()).toEqual(["ring", "weapon", "key"]);
  expect((await getPlaythrough(s.a, s.liesOfP)).game.itemKinds[0].localName).toBe("Ringe");
  await expect(correct(s.a, [{ what: "game", id: game.id, itemKinds: [{ key: "weapon" }, { key: "key" }] }])).rejects.toThrow(/still filed under ring/);
});

test("weaknesses and resistances add up; the same name in two kinds needs the kind or the id", async () => {
  await record(s.a, session({ codex: [boss, { kind: "npc", name: "Parade Master", notes: "Talks before the fight" }] }));
  await expect(record(s.a, session({ codex: [{ name: "Parade Master", weaknesses: ["Electric Blitz"] }] }))).rejects.toBeInstanceOf(AmbiguousError);
  await record(s.a, session({ codex: [{ kind: "boss", name: "parade master", weaknesses: ["fire", "Electric Blitz"], resistances: ["Acid"] }] }));
  const [e] = await codexOf(s.a, s.liesOfP, { kind: "boss" });
  expect([e.weaknesses, e.resistances]).toEqual([["Fire", "Electric Blitz"], ["Acid"]]);
});

test("a new codex entry needs a kind; an item can't be good against what isn't in the codex", async () => {
  await expect(record(s.a, session({ codex: [{ name: "Mad Donkey" }] }))).rejects.toBeInstanceOf(InvalidInputError);
  await expect(record(s.a, session({ items: [{ name: "Throwing Cell", against: [{ target: "Mad Donkey" }] }] }))).rejects.toBeInstanceOf(NotFoundError);
});

test("an item's numbers merge on record and are replaced by correct, like its count and what it is good against", async () => {
  await record(s.a, session({ codex: [boss], items: [{ name: "Puppet Saber", attributes: { "Physical ATK": 119, Technique: "C" } }] }));
  await record(s.a, session({ items: [{ name: "Puppet Saber", attributes: { "Physical ATK": 124, Weight: 11.4 }, quantity: 1 }] }));
  let [item] = await itemsOf(s.a, s.liesOfP, { name: "puppet saber" });
  expect(item.attributes).toEqual({ "Physical ATK": 124, Technique: "C", Weight: 11.4 });
  await correct(s.a, [{ what: "item", id: item.id, attributes: { Weight: 11 }, quantity: null, against: [{ target: "Parade Master" }] }]);
  [item] = await itemsOf(s.a, s.liesOfP, { name: "puppet saber" });
  expect([item.attributes, item.quantity, item.against.map((a) => a.codex.name)]).toEqual([{ Weight: 11 }, null, ["Parade Master"]]);
  await correct(s.a, [{ what: "item", id: item.id, against: [] }]);
  expect((await itemsOf(s.a, s.liesOfP, { name: "puppet saber" }))[0].against).toEqual([]);
});

test("correct fixes a codex entry: its status, lists and strategy, or removes it with its links", async () => {
  await record(s.a, session({ codex: [boss], items: [{ name: "Fire Abrasive", quantity: 2, against: [{ target: "Parade Master" }] }] }));
  const [e] = await codexOf(s.a, s.liesOfP);
  const [c] = await correct(s.a, [{ what: "codex", id: e.id, status: "beaten", weaknesses: ["Fire", "Acid"], strategy: null }]);
  expect(c.changed).toEqual(["status", "weaknesses", "strategy"]);
  const [after] = await codexOf(s.a, s.liesOfP);
  expect([after.status, after.weaknesses, after.strategy, after.beatenOn]).toEqual(["beaten", ["Fire", "Acid"], null, expect.stringMatching(/^\d{4}-/)]);
  await correct(s.a, [{ what: "codex", id: e.id, remove: true }]);
  expect(await codexOf(s.a, s.liesOfP)).toEqual([]);
  expect((await itemsOf(s.a, s.liesOfP, { name: "fire abrasive" }))[0].against).toEqual([]);
});

test("a codex entry marked as a spoiler stays out of codex, the briefing and an item's links unless asked for", async () => {
  await record(
    s.a,
    session({
      codex: [{ ...boss, name: HINT, attempts: 0, spoiler: "hint" }],
      items: [{ name: "Fire Abrasive", against: [{ target: HINT }] }],
    }),
  );
  expect(JSON.stringify(await codexOf(s.a, s.liesOfP))).not.toContain(HINT);
  expect(JSON.stringify(await toolByName("briefing")!.run(s.a, { playthroughId: s.liesOfP }))).not.toContain(HINT);
  expect(JSON.stringify(await itemsOf(s.a, s.liesOfP))).not.toContain(HINT);
  expect((await codexOf(s.a, s.liesOfP, { reveal: "hint" })).map((e) => e.name)).toEqual([HINT]);
});

test("an item marked as a spoiler doesn't show as a counter unless asked for", async () => {
  await record(s.a, session({ codex: [boss], items: [{ name: SPOILER_ITEM, against: [{ target: "Parade Master" }] }] }));
  expect((await codexOf(s.a, s.liesOfP))[0].counters).toEqual([]);
  expect((await codexOf(s.a, s.liesOfP, { reveal: "full" }))[0].counters.map((c) => c.item.name)).toEqual([SPOILER_ITEM]);
});

test("B sees nothing of A's codex and can't change it", async () => {
  await record(s.a, session({ codex: [boss] }));
  const [e] = await codexOf(s.a, s.liesOfP);
  await expect(codexOf(s.b, s.liesOfP)).rejects.toBeInstanceOf(NotFoundError);
  await expect(correct(s.b, [{ what: "codex", id: e.id, status: "beaten" }])).rejects.toBeInstanceOf(NotFoundError);
  await expect(
    record(s.b, { playthroughId: s.eldenRing, summary: "x", transcript: "x", codex: [{ id: e.id, name: "x", status: "beaten" }] }),
  ).rejects.toBeInstanceOf(NotFoundError);
  const out = await toolByName("codex")!.run(s.b, { name: "Parade" });
  expect(JSON.stringify(out)).not.toContain("Parade Master");
  expect((await codexOf(s.a, s.liesOfP))[0].status).toBe("met");
});
