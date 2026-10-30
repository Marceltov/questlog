// Each MCP tool: what it files or returns, and the `next` it builds from that.
import { beforeEach, expect, test } from "vitest";
import { buildOf } from "./builds";
import { resetDbForTests } from "./db/testing";
import { AmbiguousError, InvalidInputError, NotFoundError } from "./errors";
import { itemsOf } from "./items";
import { questsOf } from "./quests";
import { getSession } from "./sessions";
import { A_FIRST, seed, type Seed } from "./testing/fixtures";
import { TOOLS, toolByName } from "./tools";

const run = (name: string, p: { id: string }, args: unknown) => toolByName(name)!.run(p, args);
const next = (out: Record<string, unknown>) => (out.next as string[]).join("\n");

test("the table has record, briefing and open_threads, each with an English description and a next in its output", () => {
  expect(TOOLS.map((t) => t.name)).toEqual(["record", "briefing", "open_threads"]);
  for (const t of TOOLS) {
    expect(t.description).toMatch(/^[\x20-\x7e]+$/);
    expect(Object.keys(t.output.shape)).toContain("next");
  }
});

test("every tool refuses arguments that don't match its schema", async () => {
  await expect(run("record", { id: "p" }, { summary: "x" })).rejects.toBeInstanceOf(InvalidInputError);
  await expect(run("open_threads", { id: "p" }, { reveal: "everything" })).rejects.toBeInstanceOf(InvalidInputError);
});

test("record files a first session: a new game, playthrough NG, quests, stats, build and items, and next says so", async () => {
  await resetDbForTests();
  const p = { id: "p" };
  const out = await run("record", p, {
    game: "Lies of P",
    playedOn: "2026-10-20",
    summary: "Met Venigni.",
    transcript: A_FIRST,
    quests: [{ name: "Venigni's Workers", giver: "Venigni", entries: [{ kind: "next", text: "Look for the workers" }] }],
    stats: { level: 5, values: { vitality: 10 } },
    build: { mainStat: "motivity" },
    items: [{ name: "Puppet Saber", equipped: true }],
  });
  const t = out.playthrough as { id: string; label: string; url: string };
  expect(t.label).toBe("NG");
  expect(out.url).toBe(`/s/${out.sessionId}`); // made absolute by mcp.ts
  expect(out.stats).toEqual({ id: expect.any(String), level: 5, newNames: ["vitality"] });
  expect(out.build).toBe(true);
  expect(next(out)).toMatch(/no game called Lies of P/);
  expect(next(out)).toMatch(/1 quest, a stat snapshot, the build plan, 1 item/);
  expect(next(out)).toMatch(/New stat keys for Lies of P: vitality/);
  expect((await getSession(p, out.sessionId as string)).transcript).toBe(A_FIRST);
  expect((await buildOf(p, t.id)).plan).toEqual({ summary: null, mainStat: "motivity", targets: {} });
  expect((await itemsOf(p, t.id)).map((i) => [i.name, i.equipped])).toEqual([["Puppet Saber", true]]);
});

test("record keeps the transcript verbatim and refuses an empty one", async () => {
  await resetDbForTests();
  await expect(run("record", { id: "p" }, { game: "Hades", summary: "x", transcript: "   " })).rejects.toBeInstanceOf(InvalidInputError);
});

let s: Seed;

beforeEach(async () => {
  s = await seed();
});

test("record updates a quest by its exact name, adds entries, and asks about new quests that may be another name", async () => {
  const out = await run("record", s.a, {
    playthroughId: s.liesOfP,
    summary: "Found a worker; met someone new.",
    transcript: "Found one of Venigni's workers. A man at the station asked me for help.",
    quests: [
      { name: "venigni’s workers", entries: [{ kind: "log", text: "Found one worker" }] },
      { name: "The Man at the Station", entries: [{ kind: "log", text: "Asked for help" }] },
    ],
  });
  expect(out.quests).toEqual([
    expect.objectContaining({ id: s.venigni, created: false, status: "open" }),
    expect.objectContaining({ name: "The Man at the Station", created: true }),
  ]);
  expect(next(out)).toMatch(/New quests: The Man at the Station\. If one is another name of a quest already open, ask the player/);
  const venigni = (await questsOf(s.a, s.liesOfP)).find((q) => q.id === s.venigni)!;
  expect(venigni.entries.at(-1)?.text).toBe("Found one worker");
});

test("record marking a quest done says so in next", async () => {
  const out = await run("record", s.a, {
    playthroughId: s.liesOfP,
    summary: "Done.",
    transcript: "I brought Antonia the record, done.",
    quests: [{ id: s.antonia, name: "x", status: "done" }],
  });
  expect(next(out)).toMatch(/Antonia's Record is now done/);
});

test("record by title picks the one playthrough being played, and won't guess between two", async () => {
  const same = await run("record", s.a, { game: "LIES OF P", summary: "x", transcript: "x" });
  expect((same.playthrough as { id: string }).id).toBe(s.liesOfP);
  const plus = await run("record", s.a, { game: "Lies of P", label: "NG+", summary: "x", transcript: "Started NG+." });
  expect(next(plus)).toMatch(/A new playthrough of Lies of P was started: NG\+/);
  await expect(run("record", s.a, { game: "Lies of P", summary: "x", transcript: "x" })).rejects.toBeInstanceOf(AmbiguousError);
});

test("record notes when it filed spoilers, and refuses ids that aren't in the playthrough", async () => {
  const out = await run("record", s.a, {
    playthroughId: s.liesOfP,
    summary: "x",
    transcript: "Where do I find the workers?",
    quests: [{ id: s.venigni, name: "Venigni's Workers", entries: [{ kind: "next", text: "Try the station", spoiler: "hint" }] }],
  });
  expect(next(out)).toMatch(/marked as a spoiler: briefings leave it out/);
  await expect(
    run("record", s.a, { playthroughId: s.liesOfP, summary: "x", transcript: "x", quests: [{ id: s.ranni, name: "Ranni" }] }),
  ).rejects.toBeInstanceOf(NotFoundError);
});

test("briefing: the last session, open quests (open before blocked) with their next steps, the build with changes, what is equipped", async () => {
  const out = await run("briefing", s.a, {});
  expect((out.playthrough as { id: string }).id).toBe(s.liesOfP);
  expect(out.lastSession).toEqual(expect.objectContaining({ id: s.second, playedOn: "2026-10-22" }));
  const quests = out.openQuests as { id: string; status: string; nextStep: string | null; localName: string | null }[];
  expect(quests.map((q) => q.id)).toEqual([s.venigni, s.antonia, s.eugenie]);
  expect(quests.map((q) => q.status)).toEqual(["open", "open", "blocked"]);
  expect(quests[1]).toEqual(expect.objectContaining({ nextStep: "Bring Antonia a record", localName: "Antonias Schallplatte" }));
  const build = out.build as {
    plan: { mainStat: string };
    current: { level: number; stats: { key: string; localName: string; value: number; change: number }[] };
  };
  expect(build.plan.mainStat).toBe("motivity");
  expect(build.current.level).toBe(7);
  expect(build.current.stats).toEqual([
    expect.objectContaining({ key: "vitality", localName: "Vitalität", value: 10, change: 0 }),
    expect.objectContaining({ key: "motivity", localName: "Motivität", value: 15, change: 3 }),
  ]);
  expect((out.equipped as { name: string }[]).map((i) => i.name)).toEqual(["Puppet Saber"]);
  expect(next(out)).toMatch(/session of 2026-10-22/);
  expect(next(out)).toMatch(/never add steps, places, bosses or outcomes/);
  expect(next(out)).toMatch(/Eugenie's Workshop waits on the game/);
});

test("briefing with nothing recorded tells Claude to ask what the player is playing", async () => {
  const out = await run("briefing", { id: "new" }, {});
  expect(out.playthrough).toBeNull();
  expect(next(out)).toMatch(/no game for this player yet/);
});

test("open_threads: open and blocked quests with their whole log, closed ones left out", async () => {
  const out = await run("open_threads", s.a, { game: "Lies of P" });
  expect(out.reveal).toBe("none");
  const quests = out.quests as { id: string; entries: { kind: string; text: string; on: string }[] }[];
  expect(quests.map((q) => q.id)).toEqual([s.venigni, s.antonia, s.eugenie]);
  expect(quests[0].entries).toEqual([
    expect.objectContaining({ kind: "log", text: "Venigni wants his workers found", on: "2026-10-20" }),
    expect.objectContaining({ kind: "next", text: "Look for the workers", on: "2026-10-20" }),
  ]);
  expect(quests.map((q) => q.id)).not.toContain(s.polendina);
  expect(next(out)).toMatch(/Name only what is listed here/);
});

test("open_threads with no open quest says not to suggest any", async () => {
  const out = await run("open_threads", s.b, {});
  expect((out.quests as unknown[]).length).toBe(1);
  await run("record", s.b, { playthroughId: s.eldenRing, summary: "x", transcript: "Finished Ranni.", quests: [{ id: s.ranni, name: "x", status: "done" }] });
  expect(next(await run("open_threads", s.b, {}))).toMatch(/No quest is open in Elden Ring NG.*don't suggest quests/);
});
