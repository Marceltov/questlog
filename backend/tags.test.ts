// Tags (ADR 0014): free names per game on items, codex entries and quests, made up as they're needed, cleaned up with the rows they're on.
import { beforeEach, expect, test } from "vitest";
import { correct } from "./correct";
import { NotFoundError } from "./errors";
import { db, newId, now } from "./db/testing";
import { getPlaythrough } from "./games";
import { itemsOf } from "./items";
import { setTags, tagsInUse, tagsOf } from "./tags";
import { seed, type Seed } from "./testing/fixtures";

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
