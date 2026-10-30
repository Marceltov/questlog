// Two players on one instance, recorded through the real write path, for the gate tests of every read path. Ada (A) plays Lies of P:
// two open quests, one blocked, one done, a hint and a full spoiler Claude filed, two stat snapshots, a build plan and two items, one
// of them a spoiler. Ben (B) plays Elden Ring: one open quest and one item.
import { resetDbForTests } from "../db/testing";
import { record } from "../record";
import type { Player } from "../types";

export type Seed = {
  a: Player;
  b: Player;
  /** A's Lies of P playthrough. */
  liesOfP: string;
  /** B's Elden Ring playthrough. */
  eldenRing: string;
  /** A's open quests. */
  venigni: string;
  antonia: string;
  /** A's quest that waits on the game. */
  eugenie: string;
  /** A's finished quest. */
  polendina: string;
  /** A's two sessions. */
  first: string;
  second: string;
  /** B's open quest and session. */
  ranni: string;
  benSession: string;
};

export const A_FIRST =
  "Talked to Venigni at the factory, he wants me to find his workers. Antonia at the hotel asked me for a record. Stats: vitality 10, motivity 12.";
export const A_SECOND = "Gave Polendina the ergo, that's done. Eugenie says she needs a better workshop first. Motivity is 15 now. Equipped the Puppet Saber.";
export const B_FIRST = "Met Ranni at the rise, she offered me a deal. Picked up the Moonveil.";

/** The hint and the full spoiler Claude filed for A: neither may reach a read that didn't ask for it. */
export const HINT = "The workers might be near the Krat central station";
export const FULL = "Venigni dies if you take too long";
export const SPOILER_ITEM = "Venigni's Workshop Key";
/** The site A trusts for Lies of P, and where the facts of A's spoiler item come from (ADR 0008). */
export const SOURCE = "https://lies.example/wiki";
export const SPOILER_SOURCE = "https://lies.example/wiki/Workshop_Key";

/** Resets the database and records the fixture. */
export async function seed(): Promise<Seed> {
  await resetDbForTests();
  const a = { id: "player-a" };
  const b = { id: "player-b" };
  const first = await record(a, {
    game: "Lies of P",
    platform: "Switch 2",
    language: "de",
    playedOn: "2026-10-20",
    summary: "Met Venigni and Antonia.",
    transcript: A_FIRST,
    quests: [
      {
        name: "Venigni's Workers",
        giver: "Venigni",
        location: "Venigni Works",
        entries: [
          { kind: "log", text: "Venigni wants his workers found" },
          { kind: "next", text: "Look for the workers" },
        ],
      },
      { name: "Antonia's Record", localName: "Antonias Schallplatte", giver: "Antonia", entries: [{ kind: "next", text: "Bring Antonia a record" }] },
      { name: "Polendina", entries: [{ kind: "log", text: "Polendina asked for ergo" }] },
    ],
    stats: {
      level: 5,
      values: { vitality: 10, motivity: 12 },
      names: [
        { key: "vitality", name: "Vitality", localName: "Vitalität" },
        { key: "motivity", name: "Motivity", localName: "Motivität" },
      ],
    },
    build: { summary: "Motivity build", mainStat: "motivity", targets: { motivity: 40 } },
    sources: [{ url: SOURCE, title: "Lies Wiki" }],
  });
  const liesOfP = first.playthrough.id;
  const [venigni, antonia, polendina] = first.quests.map((q) => q.id);
  const second = await record(a, {
    playthroughId: liesOfP,
    playedOn: "2026-10-22",
    summary: "Finished Polendina, Eugenie needs a workshop.",
    transcript: A_SECOND,
    quests: [
      { id: polendina, name: "Polendina", status: "done", entries: [{ kind: "log", text: "Gave Polendina the ergo" }] },
      { name: "Eugenie's Workshop", giver: "Eugenie", status: "blocked", entries: [{ kind: "next", text: "Wait until the workshop is upgraded" }] },
      // What Claude filed from its own knowledge, marked as spoilers.
      {
        id: venigni,
        name: "Venigni's Workers",
        entries: [
          { kind: "next", text: HINT, spoiler: "hint" },
          { kind: "log", text: FULL, spoiler: "full" },
        ],
      },
    ],
    stats: { level: 7, values: { vitality: 10, motivity: 15 } },
    items: [
      { name: "Puppet Saber", kind: "weapon", equipped: true, verdict: "Fits the motivity build" },
      {
        name: SPOILER_ITEM,
        kind: "key",
        verdict: "Opens a room you haven't reached",
        spoiler: "full",
        sources: [{ url: SPOILER_SOURCE, facts: "Opens the workshop" }],
      },
    ],
  });
  const eugenie = second.quests.find((q) => q.name === "Eugenie's Workshop")!.id;
  const ben = await record(b, {
    game: "Elden Ring",
    playedOn: "2026-10-21",
    summary: "Met Ranni.",
    transcript: B_FIRST,
    quests: [{ name: "Ranni's Quest", giver: "Ranni", entries: [{ kind: "log", text: "Ranni offered a deal" }] }],
    items: [{ name: "Moonveil", kind: "katana", equipped: true }],
  });
  return {
    a,
    b,
    liesOfP,
    eldenRing: ben.playthrough.id,
    venigni,
    antonia,
    eugenie,
    polendina,
    first: first.sessionId,
    second: second.sessionId,
    ranni: ben.quests[0].id,
    benSession: ben.sessionId,
  };
}
