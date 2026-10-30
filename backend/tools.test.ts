// Each MCP tool: what it files or returns, and the `next` it builds from that.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { buildOf } from "./builds";
import { getPlaythrough, listPlaythroughs } from "./games";
import { resetDbForTests } from "./db/testing";
import { AmbiguousError, InvalidInputError, NotFoundError } from "./errors";
import { itemsOf } from "./items";
import { questsOf } from "./quests";
import { getSession } from "./sessions";
import { A_FIRST, FULL, HINT, SPOILER_ITEM, seed, type Seed } from "./testing/fixtures";
import { TOOLS, toolByName } from "./tools";

const run = (name: string, p: { id: string }, args: unknown) => toolByName(name)!.run(p, args);
const next = (out: Record<string, unknown>) => (out.next as string[]).join("\n");

test("the table has record, briefing, open_threads, item, correct and missed, each with an English description and a next in its output", () => {
  expect(TOOLS.map((t) => t.name)).toEqual(["record", "briefing", "open_threads", "item", "correct", "missed"]);
  for (const t of TOOLS) {
    expect(t.description).toMatch(/^[\x20-\x7e]+$/);
    expect(Object.keys(t.output.shape)).toContain("next");
  }
});

test("every tool refuses arguments that don't match its schema", async () => {
  await expect(run("record", { id: "p" }, { summary: "x" })).rejects.toBeInstanceOf(InvalidInputError);
  await expect(run("open_threads", { id: "p" }, { reveal: "everything" })).rejects.toBeInstanceOf(InvalidInputError);
  await expect(run("missed", { id: "p" }, {})).rejects.toBeInstanceOf(InvalidInputError);
  await expect(run("correct", { id: "p" }, { changes: [] })).rejects.toBeInstanceOf(InvalidInputError);
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

test("item finds the player's items by part of their name, in either language, with the build and what is equipped", async () => {
  await run("record", s.a, {
    playthroughId: s.liesOfP,
    summary: "x",
    transcript: "Found a Wintry Rapier, Winterliches Rapier in German.",
    items: [{ name: "Wintry Rapier", localName: "Winterliches Rapier", kind: "weapon" }],
  });
  const out = await run("item", s.a, { name: "winterlich" });
  expect((out.items as { name: string }[]).map((i) => i.name)).toEqual(["Wintry Rapier"]);
  expect((out.equipped as { name: string }[]).map((i) => i.name)).toEqual(["Puppet Saber"]);
  expect(out.build).toEqual(
    expect.objectContaining({ plan: expect.objectContaining({ mainStat: "motivity" }), current: expect.objectContaining({ level: 7 }) }),
  );
  expect(next(out)).toMatch(/Compare with the build/);
  const all = await run("item", s.a, {});
  expect((all.items as { name: string }[]).map((i) => i.name)).toEqual(["Puppet Saber", "Wintry Rapier"]);
});

test("item with a name the player hasn't filed says to file it, and not to describe it from knowledge", async () => {
  const out = await run("item", s.a, { name: "Big Pipe Wrench" });
  expect(out.items).toEqual([]);
  expect(next(out)).toMatch(/hasn't filed an item called Big Pipe Wrench in Lies of P NG.*file it with record.*Don't describe it/);
});

test("correct fixes a game's title, a quest's status and name, an entry and a stat, all in one call", async () => {
  const b = await run("briefing", s.a, {});
  const game = (b.playthrough as { game: { id: string } }).game.id;
  const snapshot = (b.build as { current: { id: string } }).current.id;
  const entry = (b.openQuests as { id: string; lastLog: { id: string } }[]).find((q) => q.id === s.venigni)!.lastLog.id;
  const out = await run("correct", s.a, {
    changes: [
      { what: "game", id: game, title: "Lies of P: Overture" },
      { what: "quest", id: s.antonia, status: "done", name: "Antonia's Gramophone Record" },
      { what: "entry", id: entry, text: "Venigni wants his three workers found" },
      { what: "snapshot", id: snapshot, values: { motivity: 16 } },
    ],
  });
  expect((out.changes as { what: string; changed: string[] }[]).map((c) => [c.what, c.changed])).toEqual([
    ["game", ["title"]],
    ["quest", ["name", "status"]],
    ["entry", ["text"]],
    ["snapshot", ["values"]],
  ]);
  expect(next(out)).toMatch(/Read back what changed.*game Lies of P: Overture: title; quest Antonia's Gramophone Record: name, status/);
  expect((await getPlaythrough(s.a, s.liesOfP)).game.title).toBe("Lies of P: Overture");
  const quests = await questsOf(s.a, s.liesOfP);
  expect(quests.find((q) => q.id === s.antonia)).toEqual(expect.objectContaining({ status: "done", name: "Antonia's Gramophone Record" }));
  expect(quests.find((q) => q.id === s.venigni)!.entries[0].text).toBe("Venigni wants his three workers found");
  const stats = (await buildOf(s.a, s.liesOfP)).snapshots[0].stats;
  expect(stats.map((x) => [x.key, x.value])).toEqual([
    ["vitality", 10],
    ["motivity", 16],
  ]);
});

test("correct refuses fields a row doesn't have, unknown stats, and a name another quest has", async () => {
  await expect(run("correct", s.a, { changes: [{ what: "quest", id: s.venigni, verdict: "x" }] })).rejects.toThrow(/verdict can't be set on a quest/);
  await expect(run("correct", s.a, { changes: [{ what: "quest", id: s.venigni, status: "finished" }] })).rejects.toBeInstanceOf(InvalidInputError);
  await expect(run("correct", s.a, { changes: [{ what: "quest", id: s.venigni }] })).rejects.toThrow(/nothing to change/);
  await expect(run("correct", s.a, { changes: [{ what: "quest", id: s.venigni, name: "Antonia's Record" }] })).rejects.toBeInstanceOf(AmbiguousError);
  const snapshot = (await buildOf(s.a, s.liesOfP)).snapshots[0].id;
  await expect(run("correct", s.a, { changes: [{ what: "snapshot", id: snapshot, values: { luck: 3 } }] })).rejects.toThrow(/luck aren't stats/);
});

test("correct is all or none", async () => {
  await expect(
    run("correct", s.a, {
      changes: [
        { what: "quest", id: s.antonia, status: "done" },
        { what: "item", id: "nope", equipped: false },
      ],
    }),
  ).rejects.toBeInstanceOf(NotFoundError);
  expect((await questsOf(s.a, s.liesOfP)).find((q) => q.id === s.antonia)!.status).toBe("open");
});

test("correct merges a quest into the one it really is, and removes items, sessions and playthroughs", async () => {
  const dup = await run("record", s.a, {
    playthroughId: s.liesOfP,
    summary: "x",
    transcript: "The workers quest again.",
    quests: [{ name: "Find the Workers", entries: [{ kind: "log", text: "Found a worker" }] }],
    items: [{ name: "Puppet Sabre" }],
  });
  const [q] = dup.quests as { id: string }[];
  const [i] = dup.items as { id: string }[];
  const out = await run("correct", s.a, {
    changes: [
      { what: "quest", id: q.id, mergeInto: s.venigni },
      { what: "item", id: i.id, remove: true },
    ],
  });
  expect(next(out)).toMatch(/quest Find the Workers merged into Venigni's Workers; item Puppet Sabre removed/);
  expect(next(out)).toMatch(/can't be undone/);
  const venigni = (await questsOf(s.a, s.liesOfP)).find((x) => x.id === s.venigni)!;
  expect(venigni.entries.at(-1)!.text).toBe("Found a worker");
  expect((await questsOf(s.a, s.liesOfP)).map((x) => x.name)).not.toContain("Find the Workers");
  expect((await itemsOf(s.a, s.liesOfP)).map((x) => x.name)).toEqual(["Puppet Saber"]);

  await run("correct", s.a, { changes: [{ what: "session", id: dup.sessionId, remove: true }] });
  expect((await getPlaythrough(s.a, s.liesOfP)).lastPlayedOn).toBe("2026-10-22");
  const gone = await run("correct", s.a, { changes: [{ what: "playthrough", id: s.liesOfP, remove: true }] });
  expect(next(gone)).toMatch(/playthrough NG removed with everything filed in it/);
  expect(await listPlaythroughs(s.a)).toEqual([]);
});

test("correct marks a playthrough finished and moves a session's day, with its snapshot", async () => {
  await run("correct", s.a, {
    changes: [
      { what: "playthrough", id: s.liesOfP, status: "finished" },
      { what: "session", id: s.second, playedOn: "2026-10-25" },
    ],
  });
  const t = await getPlaythrough(s.a, s.liesOfP);
  expect([t.status, t.lastPlayedOn]).toEqual(["finished", "2026-10-25"]);
  expect((await buildOf(s.a, s.liesOfP)).snapshots[0].takenOn).toBe("2026-10-25");
});

afterEach(() => {
  vi.useRealTimers();
});

test("missed: open quests left behind for three sessions, and the hints and spoilers filed for open quests at the level asked", async () => {
  const start = Date.now();
  vi.useFakeTimers({ toFake: ["Date"] });
  for (const [i, day] of ["2026-10-23", "2026-10-24", "2026-10-25"].entries()) {
    vi.setSystemTime(start + (i + 1) * 3_600_000);
    await run("record", s.a, {
      playthroughId: s.liesOfP,
      playedOn: day,
      summary: "x",
      transcript: "Still looking for the workers.",
      quests: [{ id: s.venigni, name: "x", entries: [{ kind: "log", text: `Looked on ${day}` }] }],
    });
  }
  const hint = await run("missed", s.a, { reveal: "hint" });
  expect((hint.leftBehind as { id: string }[]).map((q) => q.id)).toEqual([s.antonia]);
  const hidden = hint.hidden as { id: string; hidden: { text: string }[] }[];
  expect(hidden.map((q) => [q.id, q.hidden.map((e) => e.text)])).toEqual([[s.venigni, [HINT]]]);
  expect(hint.hiddenItems).toEqual([]);
  expect(next(hint)).toMatch(/Threads left behind.*Antonia's Record/);
  expect(next(hint)).toMatch(/say it is your knowledge, not their log/);
  const full = await run("missed", s.a, { reveal: "full" });
  expect(JSON.stringify(full)).toContain(FULL);
  expect((full.hiddenItems as { name: string }[]).map((i) => i.name)).toEqual([SPOILER_ITEM]);
});

test("missed with nothing hidden or left behind says so", async () => {
  const out = await run("missed", s.b, { reveal: "full" });
  expect(next(out)).toMatch(/nothing hidden or left behind in Elden Ring NG/);
});

test("record keeps the game's sources and an item's facts with their links; item points Claude at the sources", async () => {
  const out = await run("record", s.a, {
    playthroughId: s.liesOfP,
    playedOn: "2026-10-23",
    summary: "x",
    transcript: "Looked up the saber.",
    sources: [
      { url: "https://guides.example/lies-of-p", title: "Guides" },
      { url: "https://lies.example/wiki/", title: "Lies Wiki (new)" },
    ],
    items: [{ name: "Puppet Saber", sources: [{ url: "https://lies.example/wiki/Puppet_Saber", facts: "Motivity C, Technique C" }] }],
  });
  expect(next(out)).toMatch(/Lies of P has 2 sources the player trusts now/);
  const t = await getPlaythrough(s.a, s.liesOfP);
  // The same link (a trailing slash aside) is refreshed, not added twice.
  expect(t.game.sources.map((x) => [x.title, x.on])).toEqual([
    ["Lies Wiki (new)", "2026-10-23"],
    ["Guides", "2026-10-23"],
  ]);
  const saber = (await itemsOf(s.a, s.liesOfP, { name: "saber" }))[0];
  expect(saber.sources).toEqual([{ url: "https://lies.example/wiki/Puppet_Saber", title: null, facts: "Motivity C, Technique C", on: "2026-10-23" }]);
  const looked = await run("item", s.a, { name: "saber" });
  expect(next(looked)).toMatch(/look it up yourself with your web tools, on their sources for Lies of P: Lies Wiki \(new\)/);
  expect(next(looked)).toMatch(/never the page's text/);
});

test("without sources, item asks Claude to suggest one; correct replaces a game's sources", async () => {
  expect(next(await run("item", s.b, {}))).toMatch(/no sources for Elden Ring yet.*suggest a site/);
  const game = (await getPlaythrough(s.a, s.liesOfP)).game.id;
  await run("correct", s.a, { changes: [{ what: "game", id: game, sources: [{ url: "https://other.example", title: "Other" }] }] });
  expect((await getPlaythrough(s.a, s.liesOfP)).game.sources.map((x) => x.title)).toEqual(["Other"]);
  await expect(run("record", s.a, { playthroughId: s.liesOfP, summary: "x", transcript: "x", sources: [{ url: "ftp://nope" }] })).rejects.toBeInstanceOf(
    InvalidInputError,
  );
});
