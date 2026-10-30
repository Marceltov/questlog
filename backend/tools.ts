// The tools Claude gets, in one table; mcp.ts offers them to a connected client. Each runs as the player it is given, over the same
// domain functions the pages use, so who sees what and how much it gives away is decided in the domain (spoilers.ts), never by Claude.
// Results carry paths; mcp.ts makes them absolute. Every result also carries `next`: what Claude should do now, worked out here from
// what the domain returned. It is built only from those results, which came through the gate, so it can't name what the player hasn't
// found or another player's log.
import * as z from "zod";
import { briefing, type Briefing } from "./briefing";
import { DAY } from "./dates";
import { InvalidInputError } from "./errors";
import { findPlaythrough, type PlaythroughView } from "./games";
import { questsOf, type QuestView } from "./quests";
import { record, type Recorded } from "./record";
import { ENTRY_KINDS, OPEN_STATUSES, QUEST_STATUSES, SPOILER_LEVELS, type Player } from "./types";

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

const Spoiler = z.enum(SPOILER_LEVELS);
const Day = z.string().regex(DAY, "a day as YYYY-MM-DD");
const Url = z.string().describe("Its page in the web app, as an absolute URL: give it to the player when they may want to look");

const PlaythroughJson = z.object({
  id: z.string(),
  label: z.string().describe("NG, NG+, or what the player calls this run"),
  status: z.enum(["playing", "finished", "dropped"]),
  language: z.string().nullable().describe("The language the game is played in, when known"),
  lastPlayedOn: Day.nullable(),
  game: z.object({ id: z.string(), title: z.string(), platform: z.string().nullable() }),
  url: Url,
});

const EntryJson = z.object({
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
  url: Url,
});

const playthroughJson = (t: PlaythroughView): z.input<typeof PlaythroughJson> => t;
const questJson = (q: QuestView): z.input<typeof QuestJson> => q;

// ---- record ---------------------------------------------------------------------------------------------------------------------

const EntryInput = z.object({
  kind: z.enum(ENTRY_KINDS).describe("log: what the player did or found out; next: the next step, in vague words; decision: a choice the player made"),
  text: z.string().min(1),
  spoiler: Spoiler.optional().describe(
    "Default none: what the player found or told. hint when the text names a place, person or item the player hasn't reached; full when it names a boss, an outcome or a story event. A next step from your own knowledge of the game is at least hint",
  ),
});

const RecordInput = z.object({
  transcript: z
    .string()
    .min(1)
    .max(200_000)
    .describe("What the player said, verbatim, never a summary. A screenshot they shared: what it shows, written out as text and numbers"),
  summary: z.string().min(1).max(2000).describe("One or two sentences of what happened in this session, in the player's terms"),
  playthroughId: z.string().optional().describe("The playthrough, as briefing returns it. Without it, give game"),
  game: z.string().optional().describe("The game's title, when there is no playthroughId: an unknown title starts a new game and playthrough"),
  platform: z.string().optional().describe("For a new game: where it is played (Switch 2, PS5, PC)"),
  label: z.string().optional().describe("Which run of the game: NG, NG+; picks or starts that playthrough"),
  language: z.string().optional().describe("For a new playthrough: the language the game is played in (de, en)"),
  playedOn: Day.optional().describe("The day of the session. Default today"),
  quests: z
    .array(
      z.object({
        id: z.string().optional().describe("An existing quest's id, from briefing or open_threads"),
        name: z
          .string()
          .describe(
            "The quest's name, or the NPC's when the game names none. An exact match in the playthrough updates that quest; otherwise a new one starts",
          ),
        localName: z.string().optional().describe("The name in the game's own language, as the player said it"),
        giver: z.string().optional().describe("Who gave it"),
        location: z.string().optional().describe("Where it started"),
        status: z
          .enum(QUEST_STATUSES)
          .optional()
          .describe(
            "open: waiting on the player; blocked: waiting on the game; done, failed, dropped close it. Set done only when the player said they finished it. Default: unchanged, open for a new one",
          ),
        entries: z.array(EntryInput).optional(),
      }),
    )
    .optional()
    .describe("Quests the player started, advanced or finished in this session"),
  stats: z
    .object({
      level: z.number().int().optional(),
      values: z.record(z.string(), z.number()).describe('Each stat by its key, as earlier snapshots name it: { "vitality": 12, "motivity": 20 }'),
      names: z
        .array(
          z.object({
            key: z.string(),
            name: z.string().optional().describe("The English name"),
            localName: z.string().optional().describe("The game's own name for it"),
          }),
        )
        .optional()
        .describe("For a stat the game hasn't had yet: its English and its own name"),
    })
    .optional()
    .describe("A snapshot of the stats, as the player said them or a screenshot shows them"),
  build: z
    .object({
      summary: z.string().optional(),
      mainStat: z.string().optional().describe("The stat key the build is built around"),
      targets: z.record(z.string(), z.number()).optional(),
    })
    .optional()
    .describe("The build plan, when the player set or changed it"),
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        localName: z.string().optional(),
        kind: z.string().optional().describe("weapon, handle, blade, amulet, …, in the game's terms"),
        location: z.string().optional().describe("Where it was found"),
        equipped: z.boolean().optional(),
        verdict: z.string().optional().describe("How it fits the build, with where you know it from"),
        spoiler: Spoiler.optional().describe("Default none. hint or full when the verdict names what the player hasn't reached"),
      }),
    )
    .optional()
    .describe("Items the player found, equipped or put away"),
});

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
  build: z.object({
    plan: z.object({ summary: z.string().nullable(), mainStat: z.string().nullable(), targets: z.record(z.string(), z.number()) }).nullable(),
    current: z
      .object({ takenOn: Day, level: z.number().nullable(), stats: z.array(StatJson) })
      .nullable()
      .describe("The latest snapshot"),
  }),
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
];

export const toolByName = (name: string): Tool | undefined => TOOLS.find((t) => t.name === name);
