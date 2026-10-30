// The tools Claude gets, in one table; mcp.ts offers them to a connected client. Each runs as the player it is given, over the same
// domain functions the pages use, so who sees what and how much it gives away is decided in the domain (spoilers.ts), never by Claude.
// Results carry paths; mcp.ts makes them absolute. Every result also carries `next`: what Claude should do now, worked out here from
// what the domain returned. It is built only from those results, which came through the gate, so it can't name what the player hasn't
// found or another player's log.
import * as z from "zod";
import { briefing, type Briefing } from "./briefing";
import { buildOf } from "./builds";
import { correct, TARGETS, type Corrected } from "./correct";
import { InvalidInputError } from "./errors";
import { findPlaythrough, type PlaythroughView } from "./games";
import { itemsOf, type ItemView } from "./items";
import { missed, STALE_AFTER, type Missed } from "./missed";
import { questsOf, type QuestView } from "./quests";
import { record, type Recorded } from "./record";
import { ChangeInput, Day, RecordInput, Spoiler } from "./schemas";
import { ENTRY_KINDS, OPEN_STATUSES, PLAYTHROUGH_STATUSES, QUEST_STATUSES, type Player } from "./types";

export type Tool = {
  name: string;
  description: string;
  input: z.ZodObject;
  output: z.ZodObject;
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  /** Checks `args` against `input` (a mismatch is an InvalidInputError, a refusal the caller reports), runs as `p`, and returns the
   * result as `output` declares it, `next` included: fields the schema doesn't name are dropped. */
  run(p: Player, args: unknown): Promise<Record<string, unknown>>;
};

const Next = z
  .array(z.string())
  .describe("What to do now, worked out from what this call did: follow it before you answer the player. Empty when there is nothing to do");
type Next = string[];

const ok = <S extends z.ZodType>(_schema: S, body: z.input<S>, next: Next = []) => ({ ...(body as object), next }) as z.input<S> & { next: Next };

function check<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw new InvalidInputError(r.error.issues.map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`).join("; "));
  return r.data;
}

function tool<I extends z.ZodObject, O extends z.ZodObject>(t: {
  name: string;
  description: string;
  input: I;
  output: O;
  annotations: Tool["annotations"];
  handler: (p: Player, args: z.output<I>) => Promise<z.input<O> & { next: Next }>;
}): Tool {
  const output = t.output.extend({ next: Next });
  return {
    name: t.name,
    description: t.description,
    input: t.input,
    output,
    annotations: t.annotations,
    async run(p, args) {
      return output.parse(await t.handler(p, check(t.input, args))) as Record<string, unknown>;
    },
  };
}

// ---- Shapes -------------------------------------------------------------------------------------------------------------------

const Url = z.string().describe("Its page in the web app, as an absolute URL: give it to the player when they may want to look");

const SourceJson = z.object({
  url: z.string(),
  title: z.string().nullable(),
  facts: z.string().nullable().describe("What was taken from the page, for an item"),
  on: Day.nullable().describe("When it was added"),
});

const PlaythroughJson = z.object({
  id: z.string(),
  label: z.string().describe("NG, NG+, or what the player calls this run"),
  status: z.enum(PLAYTHROUGH_STATUSES),
  language: z.string().nullable().describe("The language the game is played in, when known"),
  lastPlayedOn: Day.nullable(),
  game: z.object({
    id: z.string(),
    title: z.string(),
    platform: z.string().nullable(),
    sources: z.array(SourceJson).describe("The sites the player trusts for this game: where you look things up when they ask"),
  }),
  url: Url,
});

const EntryJson = z.object({
  id: z.string().describe("For correct"),
  kind: z.enum(ENTRY_KINDS),
  text: z.string(),
  spoiler: Spoiler.describe("none for what the player found; hint or full only when this call asked for them"),
  on: Day.nullable().describe("The day of the session it was filed in"),
});

const QuestJson = z.object({
  id: z.string(),
  name: z.string(),
  localName: z.string().nullable().describe("The name in the game's own language"),
  giver: z.string().nullable(),
  location: z.string().nullable().describe("Where it started"),
  status: z.enum(QUEST_STATUSES),
  nextStep: z.string().nullable().describe("The latest next step this call may show"),
  url: Url,
});

const StatJson = z.object({
  key: z.string(),
  name: z.string(),
  localName: z.string().nullable(),
  value: z.number(),
  change: z.number().nullable().describe("Since the snapshot before; null for the first"),
});

const ItemJson = z.object({
  id: z.string(),
  name: z.string(),
  localName: z.string().nullable(),
  kind: z.string().nullable(),
  verdict: z.string().nullable(),
  sources: z.array(SourceJson).describe("Where its facts come from"),
  url: Url,
});

const ItemDetailJson = ItemJson.extend({
  location: z.string().nullable().describe("Where it was found"),
  equipped: z.boolean(),
  spoiler: Spoiler.describe("none for what the player found; hint or full only when this call asked for them"),
});

const PlanJson = z.object({ summary: z.string().nullable(), mainStat: z.string().nullable(), targets: z.record(z.string(), z.number()) });
const SnapshotJson = z.object({ id: z.string().describe("For correct"), takenOn: Day, level: z.number().nullable(), stats: z.array(StatJson) });

const playthroughJson = (t: PlaythroughView): z.input<typeof PlaythroughJson> => t;
const questJson = (q: QuestView): z.input<typeof QuestJson> => q;

// ---- record ---------------------------------------------------------------------------------------------------------------------

const RecordedJson = z.object({
  sessionId: z.string(),
  url: Url,
  playthrough: PlaythroughJson,
  quests: z.array(z.object({ id: z.string(), name: z.string(), status: z.enum(QUEST_STATUSES), created: z.boolean(), url: Url })),
  items: z.array(z.object({ id: z.string(), name: z.string(), created: z.boolean(), equipped: z.boolean(), url: Url })),
  stats: z.object({ id: z.string(), level: z.number().nullable(), newNames: z.array(z.string()).describe("Stat keys this game hadn't had") }).nullable(),
  build: z.boolean().describe("Whether the build plan changed"),
});

function recordNext(r: Recorded): Next {
  const next: Next = [];
  const t = r.playthrough;
  if (t.createdGame)
    next.push(
      `questlog had no game called ${t.game.title}: a new game was started, with the playthrough ${t.label}. Tell the player, so a misspelt title can be fixed.`,
    );
  else if (t.createdPlaythrough) next.push(`A new playthrough of ${t.game.title} was started: ${t.label}. Tell the player.`);
  const parts = [
    r.quests.length && `${r.quests.length} quest${r.quests.length === 1 ? "" : "s"}`,
    r.stats && "a stat snapshot",
    r.build && "the build plan",
    r.items.length && `${r.items.length} item${r.items.length === 1 ? "" : "s"}`,
  ].filter(Boolean);
  next.push(
    `Read back in a sentence or two what was filed from the session of ${r.playedOn}${parts.length ? `: ${parts.join(", ")}` : " (only the transcript)"}, with its link.`,
  );
  const fresh = r.quests.filter((q) => q.created);
  if (fresh.length && !t.createdPlaythrough)
    next.push(
      `New quests: ${fresh.map((q) => q.name).join(", ")}. If one is another name of a quest already open, ask the player, and file it under that quest's id instead.`,
    );
  for (const q of r.quests.filter((x) => x.status === "done" && x.statusBefore !== "done"))
    next.push(`${q.name} is now done: say so, and if the player only advanced it, set it back to open with record.`);
  if (r.sources)
    next.push(`${t.game.title} has ${r.sources === 1 ? "a source" : `${r.sources} sources`} the player trusts now: look things up there when they ask.`);
  if (r.stats?.newNames.length)
    next.push(
      `New stat keys for ${t.game.title}: ${r.stats.newNames.map((n) => n.key).join(", ")}. Use these keys in every later snapshot; check that they match the game's stat screen.`,
    );
  const hidden = r.quests.some((q) => q.entries.some((e) => e.spoiler !== "none")) || r.items.some((i) => i.spoiler !== "none");
  if (hidden) next.push("Some of what you filed is marked as a spoiler: briefings leave it out, and it shows only when the player asks for hints.");
  return next;
}

// ---- briefing and open_threads --------------------------------------------------------------------------------------------------

const PlaythroughRefInput = {
  playthroughId: z.string().optional().describe("A playthrough's id. Without it and without game: the one played most recently"),
  game: z.string().optional().describe("A game's title: its playthrough played most recently"),
};

const BriefingJson = z.object({
  playthrough: PlaythroughJson.nullable().describe("Null when the player has no playthrough yet (of that game)"),
  lastSession: z.object({ id: z.string(), playedOn: Day, summary: z.string(), url: Url }).nullable(),
  openQuests: z.array(QuestJson.extend({ lastLog: EntryJson.nullable() })).describe("Open first, then blocked"),
  build: z.object({ plan: PlanJson.nullable(), current: SnapshotJson.nullable().describe("The latest snapshot") }),
  equipped: z.array(ItemJson),
  others: z.array(PlaythroughJson).describe("The player's other playthroughs, most recently played first"),
});

const NO_ADDING =
  "Name only what is listed here: never add steps, places, bosses or outcomes from your own knowledge of the game, unless the player asks for hints (open_threads with reveal).";

function briefingNext(b: Briefing): Next {
  if (!b.playthrough)
    return [
      b.others.length
        ? `No playthrough matches. The player has: ${b.others.map((t) => `${t.game.title} ${t.label} (id ${t.id})`).join(", ")}. Ask which one they mean.`
        : "questlog has no game for this player yet. Ask what they are playing, and file their first session with record.",
    ];
  const next: Next = [];
  const t = b.playthrough;
  next.push(
    b.lastSession
      ? `Start with where the player left off: the session of ${b.lastSession.playedOn}.`
      : `Nothing has been recorded in ${t.game.title} ${t.label} yet: ask what happened so far and file it with record.`,
  );
  if (b.openQuests.length) next.push(NO_ADDING);
  const blocked = b.openQuests.filter((q) => q.status === "blocked");
  if (blocked.length)
    next.push(`${blocked.map((q) => q.name).join(", ")} wait${blocked.length === 1 ? "s" : ""} on the game, not the player: mention them last.`);
  if (b.others.length)
    next.push(`This is ${t.game.title} ${t.label}; the player has other playthroughs too (in others). If they meant another one, call briefing with its id.`);
  return next;
}

const ThreadsJson = z.object({
  playthrough: PlaythroughJson.nullable(),
  reveal: Spoiler.describe("What this call was allowed to show"),
  quests: z.array(QuestJson.extend({ entries: z.array(EntryJson).describe("Oldest first") })).describe("Open first, then blocked; most recently changed first"),
});

const threadsNext = (t: PlaythroughView | null, reveal: string, quests: QuestView[]): Next => {
  if (!t) return ["The player has no such playthrough yet. Ask what they are playing."];
  if (!quests.length) return [`No quest is open in ${t.game.title} ${t.label}. Tell the player; don't suggest quests from your own knowledge of the game.`];
  const next: Next = [NO_ADDING.replace(", unless the player asks for hints (open_threads with reveal)", "")];
  if (reveal !== "none")
    next.push(
      `The player asked for ${reveal === "hint" ? "hints" : "full spoilers"}: entries marked ${reveal === "hint" ? "hint" : "hint or full"} give away more than they found. Warn them once, and read out only those for the quest they asked about.`,
    );
  return next;
};

// ---- item -----------------------------------------------------------------------------------------------------------------------

const ItemLookupJson = z.object({
  playthrough: PlaythroughJson.nullable(),
  reveal: Spoiler.describe("What this call was allowed to show"),
  items: z.array(ItemDetailJson).describe("The player's items whose name contains the one asked for (all of them without a name), equipped first"),
  build: z.object({ plan: PlanJson.nullable(), current: SnapshotJson.nullable().describe("The latest snapshot") }),
  equipped: z.array(ItemDetailJson).describe("What the player has equipped now, to compare with"),
});

// Where Claude looks things up (ADR 0008): questlog never fetches a page; it says where the player wants Claude to look, and keeps what
// Claude found with its link.
function lookupNext(t: PlaythroughView): string {
  const where = t.game.sources.map((x) => (x.title ? `${x.title} (${x.url})` : x.url)).join(", ");
  return where
    ? `If the player wants to know more than questlog holds, look it up yourself with your web tools, on their sources for ${t.game.title}: ${where}. Only about what they have found. File the facts in your own words, never the page's text, with the link: correct (item, sources) or record (items with sources). If a source refuses you, say so and suggest another.`
    : `questlog has no sources for ${t.game.title} yet. If the player wants to know more than questlog holds, suggest a site you know for this game, look it up there with your web tools, and ask whether to keep it as a source (record or correct with game sources). Only about what they have found; file the facts in your own words with the link.`;
}

function itemNext(t: PlaythroughView | null, name: string | undefined, items: ItemView[], reveal: string): Next {
  if (!t) return ["The player has no such playthrough yet. Ask what they are playing."];
  const next: Next = [];
  if (name && !items.length)
    next.push(
      `The player hasn't filed an item called ${name} in ${t.game.title} ${t.label}. If they just found it, file it with record (items). Don't describe it from your own knowledge of the game unless they ask.`,
    );
  else
    next.push(
      "Compare with the build using these numbers, the verdicts and what the player tells you or a screenshot shows. Where your verdict draws on knowledge of the game, say so and where it comes from. A new or changed verdict goes in with correct (item, by id).",
      lookupNext(t),
    );
  if (reveal !== "none" && items.some((i) => i.spoiler !== "none"))
    next.push("Some items here are marked as spoilers: the player asked for them; warn once before naming one.");
  return next;
}

// ---- correct --------------------------------------------------------------------------------------------------------------------

const CorrectedJson = z.object({
  changes: z.array(
    z.object({
      what: z.enum(TARGETS),
      id: z.string(),
      name: z.string().describe("What it is called now: a title, a name or a day"),
      changed: z.array(z.string()).describe("The fields that were set"),
      removed: z.boolean(),
      mergedInto: z.object({ id: z.string(), name: z.string() }).nullable(),
      url: Url.nullable().describe("Its page in the web app, or its playthrough's; null when the playthrough or game went with it"),
    }),
  ),
});

function correctNext(cs: Corrected[]): Next {
  const next: Next = [`Read back what changed, in a sentence per change, with its link: ${cs.map(describe).join("; ")}.`];
  if (cs.some((c) => c.removed && !c.mergedInto))
    next.push("A removal can't be undone. If one was a mistake, tell the player at once and file it again with record from what they say.");
  const done = cs.filter((c) => c.what === "quest" && c.changed.includes("status"));
  if (done.length) next.push("If a quest's new status is a guess, ask the player before you go on.");
  return next;
}

const describe = (c: Corrected) =>
  c.mergedInto
    ? `quest ${c.name} merged into ${c.mergedInto.name}`
    : c.removed
      ? `${c.what} ${c.name} removed${c.what === "game" || c.what === "playthrough" ? " with everything filed in it" : ""}`
      : `${c.what} ${c.name}: ${c.changed.join(", ")}`;

// ---- missed ---------------------------------------------------------------------------------------------------------------------

const MissedJson = z.object({
  playthrough: PlaythroughJson.nullable(),
  reveal: z.enum(["hint", "full"]),
  hidden: z
    .array(QuestJson.extend({ hidden: z.array(EntryJson).describe("Only the entries above none") }))
    .describe("Open quests with hints or spoilers filed for them"),
  hiddenItems: z.array(ItemDetailJson).describe("Items marked as hints or spoilers"),
  leftBehind: z.array(QuestJson).describe(`Open quests the player hasn't touched in the last ${STALE_AFTER} sessions: their own words, no spoilers`),
});

function missedNext(m: Missed): Next {
  if (!m.playthrough) return ["The player has no such playthrough yet. Ask what they are playing."];
  const next: Next = [];
  const t = m.playthrough;
  if (m.leftBehind.length)
    next.push(
      `Threads left behind, in the player's own words (no spoilers): ${m.leftBehind.map((q) => q.name).join(", ")}. Name these first, with their links.`,
    );
  if (m.hidden.length || m.hiddenItems.length)
    next.push(
      `The rest gives away more than the player found (${m.reveal === "hint" ? "hints" : "hints and full spoilers"}). Read out only what they asked about, one quest at a time, and stop when they say so.`,
    );
  if (!m.leftBehind.length && !m.hidden.length && !m.hiddenItems.length)
    next.push(`questlog has nothing hidden or left behind in ${t.game.title} ${t.label}. Tell the player.`);
  next.push(
    `questlog knows only the player's own log, not the game. If they want more, you may answer from your own knowledge, as they asked for ${m.reveal === "hint" ? "hints" : "spoilers"}: say it is your knowledge, not their log, and stay at that level (a hint names a place or a person, never an outcome). File it only if they ask, marked ${m.reveal}.`,
  );
  return next;
}

// ---- The table ------------------------------------------------------------------------------------------------------------------

export const TOOLS: Tool[] = [
  tool({
    name: "record",
    description:
      "File one play session: the player's words verbatim as transcript, then what was learned from it, split into quests (with log entries, next steps and decisions), a stat snapshot, the build plan and items. Before filing, call briefing for the playthrough and reuse the ids of quests and items that are already there. Ask the player when you aren't sure which quest they mean, whether they finished something or only started it, or which choice they made: never file a guess.",
    input: RecordInput,
    output: RecordedJson,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    handler: async (p, args) => {
      const r = await record(p, args);
      const body = {
        sessionId: r.sessionId,
        url: r.url,
        playthrough: playthroughJson(r.playthrough),
        quests: r.quests,
        items: r.items,
        stats: r.stats && { id: r.stats.id, level: r.stats.level, newNames: r.stats.newNames.map((n) => n.key) },
        build: r.build,
      };
      return ok(RecordedJson, body, recordNext(r));
    },
  }),
  tool({
    name: "briefing",
    description:
      'Where the player was: for one playthrough, the last session, the open quests with their next steps, the current build and what is equipped. Call it when the player picks a game up again ("where was I?") and before record. It never contains spoilers.',
    input: z.object(PlaythroughRefInput),
    output: BriefingJson,
    annotations: { readOnlyHint: true },
    handler: async (p, args) => {
      const b = await briefing(p, args);
      const body = {
        ...b,
        openQuests: b.openQuests.map((q) => ({ ...questJson(q), lastLog: q.entries.findLast((e) => e.kind === "log") ?? null })),
        equipped: b.equipped,
      };
      return ok(BriefingJson, body, briefingNext(b));
    },
  }),
  tool({
    name: "open_threads",
    description:
      'The quests the player started and hasn\'t finished, with their whole log: what they did, the next steps and the choices made. Call it for "what is still open?" or before the player goes back to an area. reveal is none unless the player asked for a hint in this conversation.',
    input: z.object({
      ...PlaythroughRefInput,
      reveal: Spoiler.optional().describe("Default none: only what the player found. hint or full only when the player asked for hints or spoilers just now"),
    }),
    output: ThreadsJson,
    annotations: { readOnlyHint: true },
    handler: async (p, { reveal = "none", ...ref }) => {
      const t = await findPlaythrough(p, ref);
      const quests = t ? await questsOf(p, t.id, { statuses: OPEN_STATUSES, reveal }) : [];
      const ordered = [...quests.filter((q) => q.status === "open"), ...quests.filter((q) => q.status === "blocked")];
      return ok(ThreadsJson, { playthrough: t, reveal, quests: ordered }, threadsNext(t, reveal, ordered));
    },
  }),
  tool({
    name: "item",
    description:
      "Look up the player's items: one by name (part of it is enough, in English or the game's language), or all of them without a name, with the build plan, the latest stats and what is equipped, to compare a new find with. Call it when the player asks about an item they have or whether a new one fits their build.",
    input: z.object({
      ...PlaythroughRefInput,
      name: z.string().optional().describe("The item's name, or part of it"),
      reveal: Spoiler.optional().describe("Default none. hint or full only when the player asked for spoilers just now"),
    }),
    output: ItemLookupJson,
    annotations: { readOnlyHint: true },
    handler: async (p, { reveal = "none", name, ...ref }) => {
      const t = await findPlaythrough(p, ref);
      if (!t)
        return ok(ItemLookupJson, { playthrough: null, reveal, items: [], build: { plan: null, current: null }, equipped: [] }, itemNext(t, name, [], reveal));
      const [items, build, equipped] = await Promise.all([
        itemsOf(p, t.id, { name, reveal }),
        buildOf(p, t.id, 1),
        itemsOf(p, t.id, { equippedOnly: true, reveal: "none" }),
      ]);
      const body = { playthrough: t, reveal, items, build: { plan: build.plan, current: build.snapshots[0] ?? null }, equipped };
      return ok(ItemLookupJson, body, itemNext(t, name, items, reveal));
    },
  }),
  tool({
    name: "correct",
    description:
      "Fix or remove what was filed: a game's title, a playthrough's label or status (finished, dropped), a session's day, a quest's name or status, a log entry, a stat snapshot, an item. Each change names one row by what and id and sets some of its fields, or removes it. Only what the player said is wrong; never merge two quests (mergeInto) without asking them first.",
    input: z.object({ changes: z.array(ChangeInput).min(1).max(50) }),
    output: CorrectedJson,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    handler: async (p, { changes }) => {
      const cs = await correct(p, changes);
      return ok(CorrectedJson, { changes: cs }, correctNext(cs));
    },
  }),
  tool({
    name: "missed",
    description:
      'What the player may have missed in a playthrough: open quests they left behind, and the hints and spoilers filed for them that other reads leave out. Only when the player asks ("did I miss anything?"), and only after you warned them that the answer may give things away and they still want it. Never on your own, never in a briefing.',
    input: z.object({
      ...PlaythroughRefInput,
      reveal: z.enum(["hint", "full"]).describe("What the player agreed to: hint (places and people, no outcomes) or full (everything)"),
    }),
    output: MissedJson,
    annotations: { readOnlyHint: true },
    handler: async (p, { reveal, ...ref }) => {
      const m = await missed(p, ref, reveal);
      return ok(MissedJson, m, missedNext(m));
    },
  }),
];

export const toolByName = (name: string): Tool | undefined => TOOLS.find((t) => t.name === name);
