// The API's wire shapes. Named ones (.meta({ id })) become components of the generated OpenAPI description. They mirror the domain's
// views (games.ts, quests.ts, items.ts, …); a response goes through its schema, which drops anything it doesn't name.
import * as z from "zod";
import { TARGETS } from "../correct";
import { Day, Spoiler } from "../schemas";
import { ENTRY_KINDS, GOAL_KINDS, GOAL_STATUSES, PLAYTHROUGH_STATUSES, QUEST_STATUSES } from "../types";
import { ERROR_CODES } from "./errors";

const Url = z.string().describe("Its page in the web app, as an absolute URL");

export const ErrorJson = z
  .object({ error: z.string().describe("What went wrong, in English"), code: z.enum(ERROR_CODES) })
  .meta({ id: "Error", description: "Every error the API answers with" });

export const SourceJson = z
  .object({
    url: z.string(),
    title: z.string().nullable(),
    facts: z.string().nullable().describe("What was taken from the page, for an item"),
    on: Day.nullable().describe("When it was added"),
  })
  .meta({ id: "Source", description: "A page outside questlog, which questlog never fetches (ADR 0008)" });

export const PlaythroughJson = z
  .object({
    id: z.string(),
    label: z.string().describe("NG, NG+, or what the player calls this run"),
    status: z.enum(PLAYTHROUGH_STATUSES),
    language: z.string().nullable().describe("The language the game is played in, when known"),
    lastPlayedOn: Day.nullable(),
    character: z
      .object({ name: z.string().nullable(), class: z.string().nullable(), localClass: z.string().nullable().describe("The class in the game's own language") })
      .nullable()
      .describe("Who the player plays in this run; null until filed"),
    game: z.object({
      id: z.string(),
      title: z.string(),
      platform: z.string().nullable(),
      sources: z.array(SourceJson).describe("The sites the player trusts for this game"),
    }),
    url: Url,
  })
  .meta({ id: "Playthrough", description: "One run of a game" });

export const PlaythroughListJson = z.object({ playthroughs: z.array(PlaythroughJson).describe("Most recently played first") }).meta({ id: "PlaythroughList" });

export const EntryJson = z
  .object({
    id: z.string(),
    kind: z.enum(ENTRY_KINDS),
    text: z.string(),
    spoiler: Spoiler.describe("none for what the player found; hint or full only when the request asked for them"),
    on: Day.nullable().describe("The day of the session it was filed in"),
    sessionUrl: z.string().nullable(),
  })
  .meta({ id: "QuestEntry", description: "A line of a quest's log: what happened (log), the next step (next) or a choice made (decision)" });

export const QuestJson = z
  .object({
    id: z.string(),
    name: z.string(),
    localName: z.string().nullable().describe("The name in the game's own language"),
    giver: z.string().nullable(),
    location: z.string().nullable().describe("Where it started"),
    status: z.enum(QUEST_STATUSES),
    nextStep: z.string().nullable().describe("The latest next step the request may show"),
    entries: z.array(EntryJson).describe("Oldest first"),
    url: Url,
  })
  .meta({ id: "Quest" });

export const QuestListJson = z.object({ quests: z.array(QuestJson).describe("Most recently changed first") }).meta({ id: "QuestList" });

export const ItemJson = z
  .object({
    id: z.string(),
    name: z.string(),
    localName: z.string().nullable(),
    kind: z.string().nullable(),
    location: z.string().nullable().describe("Where it was found"),
    equipped: z.boolean(),
    verdict: z.string().nullable().describe("How it fits the build"),
    spoiler: Spoiler,
    sources: z.array(SourceJson).describe("Where its facts come from"),
    url: Url,
  })
  .meta({ id: "Item" });

export const ItemListJson = z.object({ items: z.array(ItemJson).describe("Equipped first, then the newest") }).meta({ id: "ItemList" });

const PlanJson = z.object({
  summary: z.string().nullable(),
  mainStat: z.string().nullable(),
  targets: z.record(z.string(), z.number()).describe("The player's stat goals, by stat (the open one, else the last reached)"),
});

export const GoalJson = z
  .object({
    id: z.string(),
    kind: z.enum(GOAL_KINDS),
    stat: z.object({ key: z.string(), name: z.string(), localName: z.string().nullable() }).nullable().describe("A stat goal's stat"),
    target: z.number().nullable().describe("A stat goal's value or a level goal's level"),
    current: z.number().nullable().describe("Where the latest snapshot is, for a stat or level goal"),
    item: z.object({ id: z.string(), name: z.string(), url: Url }).nullable().describe("An item goal's item"),
    text: z.string().nullable().describe("A note goal's goal, or why"),
    rank: z.number().describe("1 is first"),
    status: z.enum(GOAL_STATUSES),
    suggested: z.boolean().describe("Proposed by Claude or a guide, not agreed to by the player yet"),
    spoiler: Spoiler,
    reachedOn: Day.nullable(),
    sessionUrl: z.string().nullable().describe("The session it was set in"),
  })
  .meta({ id: "Goal", description: "A long-term goal of a playthrough (ADR 0009)" });
const SnapshotJson = z
  .object({
    id: z.string(),
    takenOn: Day,
    level: z.number().nullable(),
    stats: z.array(
      z.object({
        key: z.string(),
        name: z.string(),
        localName: z.string().nullable(),
        value: z.number(),
        change: z.number().nullable().describe("Since the snapshot before; null for the first"),
      }),
    ),
  })
  .meta({ id: "StatSnapshot" });

export const BuildJson = z
  .object({
    plan: PlanJson.nullable(),
    goals: z.array(GoalJson).describe("Open by rank (the player's, then suggestions), then reached"),
    snapshots: z.array(SnapshotJson).describe("Newest first"),
  })
  .meta({ id: "Build", description: "The build plan, its goals and the stat snapshots" });

const SessionSummaryJson = z.object({ id: z.string(), playedOn: Day, summary: z.string(), url: Url }).meta({ id: "SessionSummary" });
export const SessionListJson = z.object({ sessions: z.array(SessionSummaryJson).describe("Newest first") }).meta({ id: "SessionList" });
export const SessionJson = SessionSummaryJson.extend({ transcript: z.string().describe("What the player said, verbatim"), playthrough: PlaythroughJson }).meta({
  id: "Session",
});

export const BriefingJson = z
  .object({
    playthrough: PlaythroughJson.nullable(),
    lastSession: SessionSummaryJson.nullable(),
    openQuests: z.array(QuestJson).describe("Open first, then waiting on the game"),
    build: z.object({ plan: PlanJson.nullable(), goals: z.array(GoalJson), current: SnapshotJson.nullable() }),
    equipped: z.array(ItemJson),
    others: z.array(PlaythroughJson).describe("The player's other playthroughs"),
  })
  .meta({ id: "Briefing", description: "Where the player was. It never contains a spoiler" });

export const MissedJson = z
  .object({
    playthrough: PlaythroughJson.nullable(),
    reveal: z.enum(["hint", "full"]),
    hidden: z.array(QuestJson.extend({ hidden: z.array(EntryJson).describe("Only the entries above none") })),
    hiddenItems: z.array(ItemJson),
    leftBehind: z.array(QuestJson).describe("Open quests untouched in the last three sessions"),
  })
  .meta({ id: "Missed", description: "What the player may have missed, at the level asked for" });

export const RecordedJson = z
  .object({
    sessionId: z.string(),
    url: Url,
    playedOn: Day,
    playthrough: PlaythroughJson.extend({ createdGame: z.boolean(), createdPlaythrough: z.boolean() }),
    quests: z.array(z.object({ id: z.string(), name: z.string(), status: z.enum(QUEST_STATUSES), created: z.boolean(), url: Url })),
    items: z.array(z.object({ id: z.string(), name: z.string(), created: z.boolean(), equipped: z.boolean(), url: Url })),
    stats: z
      .object({
        id: z.string(),
        level: z.number().nullable(),
        newNames: z.array(z.object({ key: z.string(), name: z.string(), localName: z.string().nullable() })).describe("Stats the game hadn't had"),
      })
      .nullable(),
    build: z.boolean().describe("Whether the build plan or its goals changed"),
    goals: z
      .array(z.object({ id: z.string(), label: z.string(), status: z.enum(GOAL_STATUSES), suggested: z.boolean(), created: z.boolean() }))
      .describe("The goals the session set or changed"),
    reached: z.array(z.string()).describe("Goals the session's snapshot got to"),
    character: z.boolean().describe("Whether the character changed"),
    carried: z.number().nullable().describe("Open goals taken along from carryFrom"),
  })
  .meta({ id: "Recorded", description: "What was filed from a session" });

export const CorrectedJson = z
  .object({
    changes: z.array(
      z.object({
        what: z.enum(TARGETS),
        id: z.string(),
        name: z.string().describe("What it is called now: a title, a name or a day"),
        changed: z.array(z.string()).describe("The fields that were set"),
        removed: z.boolean(),
        mergedInto: z.object({ id: z.string(), name: z.string() }).nullable(),
        url: Url.nullable(),
      }),
    ),
  })
  .meta({ id: "Corrected" });

export const COMPONENTS = [
  ErrorJson,
  SourceJson,
  PlaythroughJson,
  PlaythroughListJson,
  EntryJson,
  QuestJson,
  QuestListJson,
  ItemJson,
  ItemListJson,
  SnapshotJson,
  GoalJson,
  BuildJson,
  SessionSummaryJson,
  SessionListJson,
  SessionJson,
  BriefingJson,
  MissedJson,
  RecordedJson,
  CorrectedJson,
];
