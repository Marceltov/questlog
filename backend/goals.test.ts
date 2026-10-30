// Goals and the character (ADR 0009): ranked, reached on their own when a snapshot gets there, replaced without being lost, suggested
// until the player agrees, and taken along to an NG+ when the player wants it.
import { beforeEach, expect, test } from "vitest";
import { buildOf } from "./builds";
import { correct } from "./correct";
import { InvalidInputError, NotFoundError } from "./errors";
import { getPlaythrough } from "./games";
import { goalsOf } from "./goals";
import { record } from "./record";
import { seed, type Seed } from "./testing/fixtures";
import { toolByName } from "./tools";

let s: Seed;

beforeEach(async () => {
  s = await seed();
});

const session = { playthroughId: "", summary: "Planned the build.", transcript: "Vigor straight to 20, then Technique." };
const plan = (out: Record<string, unknown>) => (out.next as string[]).join("\n");

test("the build's targets are stat goals of the player's, and the plan's targets come from them", async () => {
  const b = await buildOf(s.a, s.liesOfP);
  expect(b.goals.map((g) => [g.kind, g.stat?.key, g.target, g.status, g.suggested])).toEqual([["stat", "motivity", 40, "open", false]]);
  expect(b.goals[0].current).toBe(15);
  expect(b.plan).toEqual({ summary: "Motivity build", mainStat: "motivity", targets: { motivity: 40 } });
});

test("goals keep their order, and a new goal goes last unless ranked", async () => {
  await record(s.a, {
    ...session,
    playthroughId: s.liesOfP,
    goals: [
      { kind: "stat", stat: "vitality", target: 20, text: "More health first" },
      { kind: "note", text: "Stay under 60 % load" },
    ],
  });
  const goals = await goalsOf(s.a, s.liesOfP, { statuses: ["open"] });
  expect(goals.map((g) => [g.stat?.key ?? g.text, g.rank])).toEqual([
    ["motivity", 1],
    ["vitality", 2],
    ["Stay under 60 % load", 3],
  ]);
  expect(goals[1].text).toBe("More health first");
  expect(goals[1].sessionUrl).toMatch(/^\/s\//);
});

test("a snapshot that gets there reaches the goal on its day; a new target for the same stat drops the old goal and keeps its place", async () => {
  const out = await record(s.a, { ...session, playthroughId: s.liesOfP, playedOn: "2026-10-25", goals: [{ kind: "stat", stat: "vitality", target: 12 }] });
  expect(out.goals.map((g) => [g.label, g.status, g.created])).toEqual([["Vitality 12", "open", true]]);
  const reached = await record(s.a, { ...session, playthroughId: s.liesOfP, playedOn: "2026-10-26", stats: { values: { vitality: 12, motivity: 15 } } });
  expect(reached.reached).toEqual(["Vitality 12"]);
  const vit = (await goalsOf(s.a, s.liesOfP)).filter((g) => g.stat?.key === "vitality");
  expect(vit.map((g) => [g.status, g.reachedOn])).toEqual([["reached", "2026-10-26"]]);

  const first = (await goalsOf(s.a, s.liesOfP, { statuses: ["open"] })).find((g) => g.stat?.key === "motivity")!;
  await record(s.a, { ...session, playthroughId: s.liesOfP, build: { targets: { motivity: 30 } } });
  const mot = (await goalsOf(s.a, s.liesOfP)).filter((g) => g.stat?.key === "motivity");
  expect(mot.map((g) => [g.target, g.status, g.rank])).toEqual([
    [30, "open", first.rank],
    [40, "dropped", first.rank],
  ]);
  expect((await buildOf(s.a, s.liesOfP)).plan?.targets).toEqual({ motivity: 30, vitality: 12 });
});

test("a goal that is met already when it is set is reached at once", async () => {
  const out = await record(s.a, { ...session, playthroughId: s.liesOfP, goals: [{ kind: "level", target: 6 }] });
  expect(out.reached).toEqual(["level 6"]);
  expect(out.goals[0].status).toBe("reached");
});

test("a suggestion stays apart until the player agrees, and briefing's next names the plan and the suggestions", async () => {
  const out = await toolByName("record")!.run(s.a, {
    ...session,
    playthroughId: s.liesOfP,
    goals: [{ kind: "stat", stat: "vitality", target: 25, suggested: true }],
  });
  expect(plan(out)).toMatch(/Filed as suggestions, not the player's yet: Vitality 25/);
  expect((await buildOf(s.a, s.liesOfP)).plan?.targets).toEqual({ motivity: 40 });
  const brief = await toolByName("briefing")!.run(s.a, { playthroughId: s.liesOfP });
  expect(plan(brief)).toMatch(/The player's plan, in order: Motivity 40 \(now 15\)/);
  expect(plan(brief)).toMatch(/Suggested, not agreed yet: Vitality 25/);

  const id = (out.goals as { id: string }[])[0].id;
  await record(s.a, { ...session, playthroughId: s.liesOfP, goals: [{ id, suggested: false }] });
  expect((await buildOf(s.a, s.liesOfP)).plan?.targets).toEqual({ motivity: 40, vitality: 25 });
});

test("an item goal names one of the playthrough's items; an unknown item or stat is refused", async () => {
  const out = await record(s.a, { ...session, playthroughId: s.liesOfP, goals: [{ kind: "item", item: "puppet saber", text: "Keep the blade" }] });
  expect(out.goals[0].label).toBe("Puppet Saber: Keep the blade");
  await expect(record(s.a, { ...session, playthroughId: s.liesOfP, goals: [{ kind: "item", item: "Moonveil" }] })).rejects.toBeInstanceOf(NotFoundError);
  await expect(record(s.a, { ...session, playthroughId: s.liesOfP, goals: [{ kind: "stat", stat: "luck", target: 9 }] })).rejects.toBeInstanceOf(
    InvalidInputError,
  );
});

test("correct changes a goal: a lowered target is reached at once, a goal can be dropped or removed", async () => {
  const g = (await goalsOf(s.a, s.liesOfP))[0];
  const [c] = await correct(s.a, [{ what: "goal", id: g.id, target: 15 }]);
  expect(c.name).toBe("Motivity 15");
  expect((await goalsOf(s.a, s.liesOfP))[0].status).toBe("reached");
  await correct(s.a, [{ what: "goal", id: g.id, status: "dropped" }]);
  expect(await goalsOf(s.a, s.liesOfP, { statuses: ["open", "reached"] })).toEqual([]);
  await correct(s.a, [{ what: "goal", id: g.id, remove: true }]);
  expect(await goalsOf(s.a, s.liesOfP)).toEqual([]);
});

test("the character is the playthrough's, set by record and correct", async () => {
  await record(s.a, { ...session, playthroughId: s.liesOfP, character: { class: "Path of the Bastard", localClass: "Pfad des Bastards" } });
  expect((await getPlaythrough(s.a, s.liesOfP)).character).toEqual({ name: null, class: "Path of the Bastard", localClass: "Pfad des Bastards" });
  await correct(s.a, [{ what: "playthrough", id: s.liesOfP, characterName: "P" }]);
  expect((await getPlaythrough(s.a, s.liesOfP)).character?.name).toBe("P");
});

test("an NG+ takes the character, the plan and the open goals along only when asked, and only from the same game", async () => {
  await record(s.a, { ...session, playthroughId: s.liesOfP, character: { class: "Path of the Bastard" }, goals: [{ kind: "note", text: "Parry more" }] });
  const out = await toolByName("record")!.run(s.a, { ...session, playthroughId: undefined, game: "Lies of P", label: "NG+", carryFrom: s.liesOfP });
  const t = out.playthrough as { id: string; label: string; character: { class: string } };
  expect(t.label).toBe("NG+");
  expect(t.character.class).toBe("Path of the Bastard");
  expect(out.carried).toBe(2);
  expect(plan(out)).toMatch(/Taken along from the earlier playthrough: the character, the build plan and 2 open goals/);
  const b = await buildOf(s.a, t.id);
  expect(b.plan?.mainStat).toBe("motivity");
  expect(b.goals.map((g) => [g.kind, g.rank])).toEqual([
    ["stat", 1],
    ["note", 2],
  ]);
  await expect(record(s.a, { ...session, playthroughId: s.liesOfP, carryFrom: t.id })).rejects.toBeInstanceOf(InvalidInputError);
  await expect(record(s.a, { ...session, playthroughId: undefined, game: "Lies of P", label: "NG++", carryFrom: s.eldenRing })).rejects.toBeInstanceOf(
    NotFoundError,
  );
});
