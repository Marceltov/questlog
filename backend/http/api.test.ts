// The REST API over the seed: each route as the player its token names, through the same gate as the tools (values V1, V2). Who a token
// names is checked in oauth.test.ts; here a header stands in for it.
import { beforeEach, expect, test, vi } from "vitest";
import { db } from "../db/testing";
import { getPlaythrough } from "../games";
import { itemsOf } from "../items";
import { questsOf } from "../quests";
import { record } from "../record";
import { setTags } from "../tags";
import { A_FIRST, FULL, HINT, SPOILER_ITEM, seed, type Seed } from "../testing/fixtures";
import { dispatch } from "./api";

vi.mock("../auth/session", () => ({
  playerFromApiToken: async (req: Request) => {
    const id = req.headers.get("x-test-player");
    return id ? { id } : null;
  },
}));

let s: Seed;

beforeEach(async () => {
  s = await seed();
});

const call = (who: { id: string } | null, method: string, path: string, body?: unknown) => {
  const url = new URL(`http://localhost:3000/api/v1/${path}`);
  const req = new Request(url, {
    method,
    headers: { ...(who ? { "x-test-player": who.id } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return dispatch(req, url.pathname.split("/").slice(3).map(decodeURIComponent));
};
const json = async (r: Response) => ({ status: r.status, body: await r.json() });

test("without a token every route is 401, with a challenge pointing at the API's metadata", async () => {
  for (const path of ["playthroughs", `playthroughs/${s.liesOfP}`, `sessions/${s.first}`, "openapi.json"]) {
    const r = await call(null, "GET", path);
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toMatch(/resource_metadata=".*\/\.well-known\/oauth-protected-resource\/api\/v1"/);
  }
  expect((await call(null, "POST", "sessions", { game: "x", summary: "x", transcript: "x" })).status).toBe(401);
});

test("the player's playthroughs, a briefing, quests, items, the build and sessions, with absolute links", async () => {
  const list = await json(await call(s.a, "GET", "playthroughs"));
  expect(list.body.playthroughs.map((t: { id: string }) => t.id)).toEqual([s.liesOfP]);
  expect(list.body.playthroughs[0].url).toMatch(/^https?:\/\/.+\/p\//);
  const b = await json(await call(s.a, "GET", `playthroughs/${s.liesOfP}/briefing`));
  expect(b.body.openQuests.map((q: { id: string }) => q.id)).toEqual([s.venigni, s.antonia, s.eugenie]);
  const open = await json(await call(s.a, "GET", `playthroughs/${s.liesOfP}/quests?status=open,blocked`));
  expect(open.body.quests).toHaveLength(3);
  const items = await json(await call(s.a, "GET", `playthroughs/${s.liesOfP}/items?name=saber`));
  expect(items.body.items.map((i: { name: string }) => i.name)).toEqual(["Puppet Saber"]);
  const build = await json(await call(s.a, "GET", `playthroughs/${s.liesOfP}/build`));
  expect(build.body.snapshots).toHaveLength(2);
  const sessions = await json(await call(s.a, "GET", `playthroughs/${s.liesOfP}/sessions`));
  expect(sessions.body.sessions.map((x: { id: string }) => x.id)).toEqual([s.second, s.first]);
  const one = await json(await call(s.a, "GET", `sessions/${s.first}`));
  expect(one.body.transcript).toBe(A_FIRST);
});

test("no spoiler unless the request asks; missed needs a reveal", async () => {
  const quiet = JSON.stringify((await json(await call(s.a, "GET", `playthroughs/${s.liesOfP}/quests`))).body);
  expect(quiet).not.toContain(HINT);
  expect(JSON.stringify((await json(await call(s.a, "GET", `playthroughs/${s.liesOfP}/briefing`))).body)).not.toContain(HINT);
  expect(JSON.stringify((await json(await call(s.a, "GET", `playthroughs/${s.liesOfP}/items`))).body)).not.toContain(SPOILER_ITEM);
  const hint = JSON.stringify((await json(await call(s.a, "GET", `playthroughs/${s.liesOfP}/quests?reveal=hint`))).body);
  expect(hint).toContain(HINT);
  expect(hint).not.toContain(FULL);
  expect((await call(s.a, "GET", `playthroughs/${s.liesOfP}/missed`)).status).toBe(400);
  expect(JSON.stringify((await json(await call(s.a, "GET", `playthroughs/${s.liesOfP}/missed?reveal=full`))).body)).toContain(FULL);
});

test("another player's ids are 404 on every route, and B's lists hold nothing of A's", async () => {
  for (const path of [
    `playthroughs/${s.liesOfP}`,
    `playthroughs/${s.liesOfP}/briefing`,
    `playthroughs/${s.liesOfP}/quests?reveal=full`,
    `playthroughs/${s.liesOfP}/items?reveal=full`,
    `playthroughs/${s.liesOfP}/build`,
    `playthroughs/${s.liesOfP}/sessions`,
    `playthroughs/${s.liesOfP}/missed?reveal=full`,
    `sessions/${s.first}`,
  ])
    expect((await json(await call(s.b, "GET", path))).body.code).toBe("not_found");
  expect(JSON.stringify((await json(await call(s.b, "GET", "playthroughs"))).body)).not.toContain("Lies of P");
  const r = await json(await call(s.b, "POST", "corrections", { changes: [{ what: "quest", id: s.venigni, remove: true }] }));
  expect([r.status, r.body.code]).toEqual([404, "not_found"]);
  expect((await questsOf(s.a, s.liesOfP)).map((q) => q.id)).toContain(s.venigni);
});

test("POST /sessions files a session (201) and /corrections fixes it; bad input is 400, two playthroughs 409", async () => {
  const filed = await json(
    await call(s.a, "POST", "sessions", {
      playthroughId: s.liesOfP,
      summary: "x",
      transcript: "Antonia's record, done.",
      quests: [{ id: s.antonia, name: "x", status: "done" }],
    }),
  );
  expect(filed.status).toBe(201);
  expect(filed.body.quests).toEqual([expect.objectContaining({ id: s.antonia, status: "done" })]);
  expect(filed.body).not.toHaveProperty("next");
  const fixed = await json(await call(s.a, "POST", "corrections", { changes: [{ what: "quest", id: s.antonia, status: "open" }] }));
  expect(fixed.body.changes[0]).toEqual(expect.objectContaining({ what: "quest", changed: ["status"] }));
  expect((await json(await call(s.a, "POST", "sessions", "not json"))).body.code).toBe("invalid_request");
  expect((await json(await call(s.a, "POST", "sessions", { summary: "x" }))).body.code).toBe("invalid_request");
  await call(s.a, "POST", "sessions", { game: "Lies of P", label: "NG+", summary: "x", transcript: "NG+." });
  const two = await json(await call(s.a, "POST", "sessions", { game: "Lies of P", summary: "x", transcript: "x" }));
  expect([two.status, two.body.code]).toEqual([409, "ambiguous"]);
});

test("an unknown path is 404, a wrong method 405 with Allow, and the description is served", async () => {
  expect((await call(s.a, "GET", "nope")).status).toBe(404);
  const wrong = await call(s.a, "DELETE", "playthroughs");
  expect([wrong.status, wrong.headers.get("allow")]).toEqual([405, "GET, HEAD"]);
  const doc = await json(await call(s.a, "GET", "openapi.json"));
  expect(doc.body.openapi).toBe("3.1.1");
});

test("items and codex entries come with their tags, and ?tag= keeps only those that carry it", async () => {
  await record(s.a, { playthroughId: s.liesOfP, summary: "Found grease.", transcript: "Found a fire grease.", items: [{ name: "Fire Grease" }] });
  const items = await itemsOf(s.a, s.liesOfP);
  expect(items.length).toBe(2);
  const game = (await getPlaythrough(s.a, s.liesOfP)).game.id;
  await (await db()).transaction().execute((trx) => setTags(trx, s.a, game, "item", items[0].id, ["fire"]));
  const r = await json(await call(s.a, "GET", `playthroughs/${s.liesOfP}/items?tag=fire`));
  expect(r.status).toBe(200);
  expect(r.body.items.map((i: { id: string; tags: string[] }) => [i.id, i.tags])).toEqual([[items[0].id, ["fire"]]]);
  expect((await json(await call(s.a, "GET", `playthroughs/${s.liesOfP}/codex?tag=fire`))).body.entries).toEqual([]);
});
