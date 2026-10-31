// Notes and descriptions (ADR 0011): the player's own notes on everything they keep, added to by record and replaced by correct, and a
// description of what a thing is, replaced by both.
import { beforeEach, expect, test } from "vitest";
import { buildOf } from "./builds";
import { codexOf } from "./codex";
import { correct } from "./correct";
import { getPlaythrough } from "./games";
import { goalsOf } from "./goals";
import { itemsOf } from "./items";
import { questsOf } from "./quests";
import { record } from "./record";
import { sessionsOf } from "./sessions";
import { seed, type Seed } from "./testing/fixtures";
import { toolByName } from "./tools";

let s: Seed;

beforeEach(async () => {
  s = await seed();
});

const session = (extra: Record<string, unknown>) => ({ playthroughId: s.liesOfP, summary: "Explored Krat.", transcript: "We explored Krat.", ...extra });

test("record files notes and a description on everything the player keeps; a second note adds a paragraph, the same one doesn't", async () => {
  const filed = await record(
    s.a,
    session({
      notes: { game: "Love the atmosphere", playthrough: "Going for a dex build this time", session: "Short evening" },
      gameDescription: "A soulslike after Pinocchio",
      quests: [{ name: "Venigni's Request", description: "Find Venigni's workers", notes: "Check the factory first" }],
      items: [{ name: "Fire Axe", kind: "weapon", description: "A heavy axe with fire", notes: "Too slow for me" }],
      codex: [{ kind: "npc", name: "Arlecchino", description: "A riddle-loving puppet", notes: "Creepy" }],
      stats: { values: { vitality: 25, motivity: 15 }, notes: "Feels tanky now" },
      goals: [{ kind: "note", text: "Parry more", notes: "Practice on the Parade Master" }],
    }),
  );
  await record(s.a, session({ notes: { game: "Love the atmosphere" }, items: [{ name: "Fire Axe", notes: "Good against puppets though" }] }));

  const t = await getPlaythrough(s.a, s.liesOfP);
  expect([t.game.description, t.game.notes, t.notes]).toEqual(["A soulslike after Pinocchio", "Love the atmosphere", "Going for a dex build this time"]);
  expect((await sessionsOf(s.a, s.liesOfP)).find((x) => x.id === filed.sessionId)?.notes).toBe("Short evening");
  const q = (await questsOf(s.a, s.liesOfP)).find((x) => x.name === "Venigni's Request")!;
  expect([q.description, q.notes]).toEqual(["Find Venigni's workers", "Check the factory first"]);
  const [axe] = await itemsOf(s.a, s.liesOfP, { name: "fire axe" });
  expect([axe.description, axe.notes]).toEqual(["A heavy axe with fire", "Too slow for me\n\nGood against puppets though"]);
  const [npc] = await codexOf(s.a, s.liesOfP, { name: "arlecchino" });
  expect([npc.description, npc.notes]).toEqual(["A riddle-loving puppet", "Creepy"]);
  expect((await buildOf(s.a, s.liesOfP)).snapshots[0].notes).toBe("Feels tanky now");
  expect((await goalsOf(s.a, s.liesOfP)).find((g) => g.text === "Parry more")?.notes).toBe("Practice on the Parade Master");

  const brief = await toolByName("briefing")!.run(s.a, { playthroughId: s.liesOfP });
  expect((brief.playthrough as { notes: string }).notes).toBe("Going for a dex build this time");
});

test("correct replaces or clears notes and descriptions, and refuses them on a log entry", async () => {
  await record(s.a, session({ items: [{ name: "Fire Axe", description: "An axe", notes: "Too slow" }] }));
  const [axe] = await itemsOf(s.a, s.liesOfP, { name: "fire axe" });
  await correct(s.a, [{ what: "item", id: axe.id, notes: "Actually fine with the right handle", description: null }]);
  const [after] = await itemsOf(s.a, s.liesOfP, { name: "fire axe" });
  expect([after.notes, after.description]).toEqual(["Actually fine with the right handle", null]);
  const t = await getPlaythrough(s.a, s.liesOfP);
  await correct(s.a, [
    { what: "playthrough", id: t.id, notes: "NG run" },
    { what: "game", id: t.game.id, notes: "Favourite soulslike" },
  ]);
  const again = await getPlaythrough(s.a, s.liesOfP);
  expect([again.notes, again.game.notes]).toEqual(["NG run", "Favourite soulslike"]);
  const entry = (await questsOf(s.a, s.liesOfP))[0].entries[0];
  await expect(correct(s.a, [{ what: "entry", id: entry.id, notes: "x" }])).rejects.toThrow(/can't be set on a entry/);
});
