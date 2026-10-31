// Tags (ADR 0014): free names per game on items, codex entries and quests, made up as they're needed, cleaned up with the rows they're on.
import { beforeEach, expect, test } from "vitest";
import { correct } from "./correct";
import { AmbiguousError, NotFoundError } from "./errors";
import { db, newId, now } from "./db/testing";
import { getPlaythrough } from "./games";
import { codexOf } from "./codex";
import { itemsOf } from "./items";
import { questsOf } from "./quests";
import { record } from "./record";
import { setTags, tagsInUse, tagsOf } from "./tags";
import { SPOILER_ITEM, seed, type Seed } from "./testing/fixtures";
import { toolByName } from "./tools";

let s: Seed;

beforeEach(async () => {
  s = await seed();
});

const saber = async () => (await itemsOf(s.a, s.liesOfP)).find((i) => i.name === "Puppet Saber")!.id;

// A tag on rows, written straight into the tables: what the write path does is tested further down.
async function tagRows(name: string, rows: { what: "item" | "codex" | "quest"; id: string }[]): Promise<string> {
  const d = await db();
  const gameId = (await getPlaythrough(s.a, s.liesOfP)).game.id;
  const id = newId();
  await d.insertInto("tags").values({ id, player_id: s.a.id, game_id: gameId, name, norm: name, created_at: now() }).execute();
  for (const r of rows) await d.insertInto("tag_links").values({ tag_id: id, player_id: s.a.id, what: r.what, row_id: r.id }).execute();
  return id;
}

const links = async () => (await db()).selectFrom("tag_links").selectAll().execute();
const tags = async () => (await db()).selectFrom("tags").select("name").execute();

test("a deleted row takes its tag links along, and a tag with no links goes", async () => {
  const item = await saber();
  await tagRows("fire", [
    { what: "item", id: item },
    { what: "quest", id: s.venigni },
  ]);
  await correct(s.a, [{ what: "item", id: item, remove: true }]);
  expect((await links()).map((l) => l.what)).toEqual(["quest"]);
  expect(await tags()).toEqual([{ name: "fire" }]);
  await correct(s.a, [{ what: "quest", id: s.venigni, remove: true }]);
  expect(await links()).toEqual([]);
  expect(await tags()).toEqual([]);
});

test("deleting a playthrough cascades to its rows' tag links", async () => {
  await tagRows("fire", [{ what: "item", id: await saber() }]);
  await correct(s.a, [{ what: "playthrough", id: s.liesOfP, remove: true }]);
  expect(await links()).toEqual([]);
  expect(await tags()).toEqual([]);
});

const gameOf = async (p = s.a, run = s.liesOfP) => (await getPlaythrough(p, run)).game.id;
async function write(what: "item" | "codex" | "quest", id: string, names: string[], p = s.a, gameId?: string) {
  const game = gameId ?? (await gameOf());
  return (await db()).transaction().execute((trx) => setTags(trx, p, game, what, id, names));
}

test("setTags creates new tags and reuses existing ones by their norm form", async () => {
  expect(await write("item", await saber(), ["fire"])).toEqual(["fire"]);
  expect(await write("quest", s.venigni, ["Fire", "  frost   bite "])).toEqual(["frost bite"]);
  expect((await tagsOf(await db(), s.a, "quest", [s.venigni])).get(s.venigni)).toEqual(["fire", "frost bite"]);
  expect((await tags()).map((t) => t.name).sort()).toEqual(["fire", "frost bite"]);
});

test("setTags replaces a row's tags, and a tag no row has goes", async () => {
  const item = await saber();
  await write("item", item, ["fire"]);
  await write("item", item, ["frost"]);
  expect((await tagsOf(await db(), s.a, "item", [item])).get(item)).toEqual(["frost"]);
  expect(await tags()).toEqual([{ name: "frost" }]);
});

test("another player's game or row can't be tagged", async () => {
  await expect(write("item", await saber(), ["fire"], s.a, await gameOf(s.b, s.eldenRing))).rejects.toThrow(NotFoundError);
  await expect(write("quest", s.ranni, ["fire"])).rejects.toThrow(NotFoundError);
});

test("tagsInUse counts tags over rows, most used first, then by name", () => {
  expect(tagsInUse([{ tags: ["frost", "fire"] }, { tags: ["fire"] }, { tags: ["bleed"] }])).toEqual([
    { name: "fire", count: 2 },
    { name: "bleed", count: 1 },
    { name: "frost", count: 1 },
  ]);
});

const boss = async () => {
  await record(s.a, {
    playthroughId: s.liesOfP,
    summary: "Fought the Parade Master.",
    transcript: "The Parade Master burns.",
    codex: [{ kind: "boss", name: "Parade Master" }],
  });
  return (await codexOf(s.a, s.liesOfP)).find((e) => e.name === "Parade Master")!.id;
};

test("items, codex entries and quests come with their tags, and a tag filter keeps only those that carry it", async () => {
  const item = await saber();
  const entry = await boss();
  await write("item", item, ["fire", "motivity"]);
  await write("codex", entry, ["fire"]);
  await write("quest", s.venigni, ["workers"]);
  expect((await itemsOf(s.a, s.liesOfP)).find((i) => i.id === item)!.tags).toEqual(["fire", "motivity"]);
  expect((await questsOf(s.a, s.liesOfP)).find((q) => q.id === s.venigni)!.tags).toEqual(["workers"]);
  expect((await itemsOf(s.a, s.liesOfP, { tag: "FIRE" })).map((i) => i.id)).toEqual([item]);
  expect((await codexOf(s.a, s.liesOfP, { tag: "fire" })).map((e) => e.id)).toEqual([entry]);
  expect(await itemsOf(s.a, s.liesOfP, { tag: "frost" })).toEqual([]);
});

test("a tag only a spoiler carries stays hidden with it", async () => {
  const key = (await itemsOf(s.a, s.liesOfP, { reveal: "full" })).find((i) => i.name === SPOILER_ITEM)!.id;
  await write("item", key, ["workshop"]);
  expect(tagsInUse(await itemsOf(s.a, s.liesOfP))).toEqual([]);
  expect(tagsInUse(await itemsOf(s.a, s.liesOfP, { reveal: "full" }))).toEqual([{ name: "workshop", count: 1 }]);
});

test("record tags items, codex entries and quests, reports the tags it made, and leaves tags alone when it names none", async () => {
  const r = await record(s.a, {
    playthroughId: s.liesOfP,
    summary: "Got ready for the fire boss.",
    transcript: "Bought fire grease and a resistance pot for the Parade Master.",
    items: [
      { name: "Fire Grease", kind: "consumable", tags: ["fire"] },
      { name: "Puppet Saber", tags: ["Fire", "motivity"] },
    ],
    codex: [{ kind: "boss", name: "Parade Master", tags: ["fire"] }],
    quests: [{ id: s.venigni, name: "Venigni's Request", tags: ["workers"] }],
  });
  expect(r.newTags.sort()).toEqual(["fire", "motivity", "workers"]);
  const items = await itemsOf(s.a, s.liesOfP, { tag: "fire" });
  expect(items.map((i) => i.name).sort()).toEqual(["Fire Grease", "Puppet Saber"]);
  expect((await codexOf(s.a, s.liesOfP, { tag: "fire" })).map((e) => e.name)).toEqual(["Parade Master"]);
  expect((await questsOf(s.a, s.liesOfP)).find((q) => q.id === s.venigni)!.tags).toEqual(["workers"]);

  const again = await record(s.a, {
    playthroughId: s.liesOfP,
    summary: "Used the saber.",
    transcript: "Used the saber.",
    items: [{ name: "Puppet Saber", equipped: true }],
  });
  expect(again.newTags).toEqual([]);
  expect((await itemsOf(s.a, s.liesOfP, { tag: "motivity" })).map((i) => i.name)).toEqual(["Puppet Saber"]);
});

const tagId = async (name: string) => (await (await db()).selectFrom("tags").select("id").where("name", "=", name).executeTakeFirstOrThrow()).id;

test("correct sets the tags of an item, a codex entry and a quest", async () => {
  const item = await saber();
  const entry = await boss();
  await correct(s.a, [
    { what: "item", id: item, tags: ["fire"] },
    { what: "codex", id: entry, tags: ["fire", "boss rush"] },
    { what: "quest", id: s.venigni, tags: [] },
  ]);
  expect((await itemsOf(s.a, s.liesOfP, { tag: "fire" })).map((i) => i.id)).toEqual([item]);
  expect((await codexOf(s.a, s.liesOfP)).find((e) => e.id === entry)!.tags).toEqual(["boss rush", "fire"]);
});

test("a tag is renamed, and a name another tag has is refused with that tag's id", async () => {
  await write("item", await saber(), ["fire"]);
  await write("quest", s.venigni, ["flame"]);
  const [r] = await correct(s.a, [{ what: "tag", id: await tagId("flame"), name: "Flames" }]);
  expect(r.name).toBe("Flames");
  expect((await questsOf(s.a, s.liesOfP)).find((q) => q.id === s.venigni)!.tags).toEqual(["Flames"]);
  const fire = await tagId("fire");
  await expect(correct(s.a, [{ what: "tag", id: await tagId("Flames"), name: "FIRE" }])).rejects.toThrow(AmbiguousError);
  await expect(correct(s.a, [{ what: "tag", id: await tagId("Flames"), name: "FIRE" }])).rejects.toThrow(fire);
});

test("merging a tag a row carries both of leaves that row with one", async () => {
  const item = await saber();
  await write("item", item, ["fire", "flame"]);
  await write("quest", s.venigni, ["flame"]);
  await correct(s.a, [{ what: "tag", id: await tagId("flame"), mergeInto: await tagId("fire") }]);
  expect((await itemsOf(s.a, s.liesOfP)).find((i) => i.id === item)!.tags).toEqual(["fire"]);
  expect((await questsOf(s.a, s.liesOfP)).find((q) => q.id === s.venigni)!.tags).toEqual(["fire"]);
  expect(await tags()).toEqual([{ name: "fire" }]);
});

test("a removed tag comes off every row; another player's tag isn't found", async () => {
  const item = await saber();
  await write("item", item, ["fire"]);
  const fire = await tagId("fire");
  await expect(correct(s.b, [{ what: "tag", id: fire, remove: true }])).rejects.toThrow(NotFoundError);
  await correct(s.a, [{ what: "tag", id: fire, remove: true }]);
  expect((await itemsOf(s.a, s.liesOfP)).find((i) => i.id === item)!.tags).toEqual([]);
  expect(await links()).toEqual([]);
});

const run = (name: string, args: unknown) => toolByName(name)!.run(s.a, args) as Promise<Record<string, unknown>>;

test("briefing, item and codex list the tags in use with their ids, and item and codex filter by one", async () => {
  const item = await saber();
  const entry = await boss();
  await write("item", item, ["fire"]);
  await write("codex", entry, ["fire"]);
  await write("quest", s.venigni, ["workers"]);
  const key = (await itemsOf(s.a, s.liesOfP, { reveal: "full" })).find((i) => i.name === SPOILER_ITEM)!.id;
  await write("item", key, ["secret"]);
  const fire = { id: await tagId("fire"), name: "fire", count: 2 };
  const workers = { id: await tagId("workers"), name: "workers", count: 1 };
  expect((await run("briefing", { playthroughId: s.liesOfP })).tags).toEqual([fire, workers]);
  const items = await run("item", { playthroughId: s.liesOfP, tag: "fire" });
  expect((items.items as { id: string }[]).map((i) => i.id)).toEqual([item]);
  expect(items.tags).toEqual([fire, workers]);
  const codex = await run("codex", { playthroughId: s.liesOfP, tag: "fire" });
  expect((codex.entries as { id: string }[]).map((e) => e.id)).toEqual([entry]);
  expect(codex.tags).toEqual([fire, workers]);
});
