// The input of the writes, shared by /mcp (tools.ts) and /api/v1 (http/api.ts), so both take the same thing. The descriptions are written
// for Claude, who reads them as the tool's schema; they read as well in the OpenAPI description.
import * as z from "zod";
import { TARGETS } from "./correct";
import { DAY } from "./dates";
import { ENTRY_KINDS, GOAL_KINDS, GOAL_STATUSES, PLAYTHROUGH_STATUSES, QUEST_STATUSES, SPOILER_LEVELS } from "./types";

export const Spoiler = z.enum(SPOILER_LEVELS);
export const Day = z.string().regex(DAY, "a day as YYYY-MM-DD");

export const SourceInput = z.object({
  url: z
    .string()
    .regex(/^https?:\/\/\S+$/, "an http or https URL")
    .describe("The page"),
  title: z.string().optional().describe("What it is: the site's name, or the page's title"),
  facts: z
    .string()
    .max(2000)
    .optional()
    .describe("For an item: the facts you took from the page, in your own words (scaling, weight, where found), never its text"),
});

export const EntryInput = z.object({
  kind: z.enum(ENTRY_KINDS).describe("log: what the player did or found out; next: the next step, in vague words; decision: a choice the player made"),
  text: z.string().min(1),
  spoiler: Spoiler.optional().describe(
    "Default none: what the player found or told. hint when the text names a place, person or item the player hasn't reached; full when it names a boss, an outcome or a story event. A next step from your own knowledge of the game is at least hint",
  ),
});

export const GoalInput = z.object({
  id: z.string().optional().describe("An existing goal's id, from briefing, to change it (accept a suggestion, re-rank, mark reached or dropped)"),
  kind: z
    .enum(GOAL_KINDS)
    .optional()
    .describe("For a new goal. stat: a stat to a value; level: a character level; item: something to do with an item; note: anything else"),
  stat: z.string().optional().describe("stat: the stat's key, as snapshots name it"),
  target: z.number().optional().describe("stat: the value; level: the level. A new target for the same stat replaces the open goal (the old one is dropped)"),
  item: z.string().optional().describe("item: the item's id or exact name in this playthrough"),
  text: z.string().optional().describe("note: the goal itself. Any goal: why, in the player's terms"),
  suggested: z
    .boolean()
    .optional()
    .describe("true for a goal you or a guide propose and the player hasn't agreed to yet. Default false: the player decided it"),
  status: z
    .enum(GOAL_STATUSES)
    .optional()
    .describe("reached for an item or note goal the player finished (stat and level goals get there on their own), dropped when given up"),
  spoiler: Spoiler.optional().describe("Default none. hint or full when the goal names a place, item or outcome the player hasn't reached"),
  rank: z.number().int().min(1).optional().describe("Its place in the order, 1 first. Default: last; a replacing goal keeps the old one's place"),
});

export const RecordInput = z.object({
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
      targets: z.record(z.string(), z.number()).optional().describe("Short for stat goals the player decided: { vigor: 20 }. For order or a reason, use goals"),
    })
    .optional()
    .describe("The build plan, when the player set or changed it"),
  goals: z
    .array(GoalInput)
    .optional()
    .describe("Long-term goals the player set or changed in this session, in order; and ones you suggest, marked suggested, until they agree"),
  character: z
    .object({
      name: z.string().optional(),
      class: z.string().optional().describe("The starting class, origin or combat memory, in English"),
      localClass: z.string().optional().describe("The class's name in the game's own language"),
    })
    .optional()
    .describe("Who the player plays in this playthrough, when they say or a screenshot shows it"),
  carryFrom: z
    .string()
    .optional()
    .describe(
      "Starting a new playthrough (NG+) with game and label: the playthrough to take the character, build plan and open goals from. Only when the player wants it",
    ),
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
        sources: z.array(SourceInput).optional().describe("The pages you took its facts from, with the facts; merged by link into those it has"),
      }),
    )
    .optional()
    .describe("Items the player found, equipped or put away"),
  sources: z
    .array(SourceInput)
    .optional()
    .describe("Sites the player trusts for this game (a wiki, a guide), where you look things up when they ask; merged by link"),
});

export const Nullable = (s: z.ZodString, what: string) => s.nullable().optional().describe(`${what}; null clears it`);

export const ChangeInput = z.object({
  what: z.enum(TARGETS).describe("The kind of row: game, playthrough, session, quest, entry (a quest's log line), snapshot (stats), item or goal"),
  id: z.string().describe("Its id, as briefing, open_threads, item or record returned it"),
  remove: z
    .boolean()
    .optional()
    .describe(
      "Remove it. A game or playthrough takes everything filed in it along; a session its log entries and its snapshot; a quest its entries. Only when the player said so",
    ),
  mergeInto: z
    .string()
    .optional()
    .describe("A quest only: the id of the quest it really is. Its entries move there and it is removed. Only after the player agreed"),
  title: z.string().optional().describe("game"),
  platform: Nullable(z.string(), "game"),
  label: z.string().optional().describe("playthrough: NG, NG+, …"),
  language: Nullable(z.string(), "playthrough"),
  status: z
    .string()
    .optional()
    .describe(
      `playthrough: ${PLAYTHROUGH_STATUSES.join(", ")}. quest: ${QUEST_STATUSES.join(", ")}; done only when the player said they finished it. goal: ${GOAL_STATUSES.join(", ")}`,
    ),
  summary: z.string().optional().describe("session"),
  playedOn: Day.optional().describe("session (its snapshot moves with it) or snapshot: the day"),
  name: z.string().optional().describe("quest or item"),
  localName: Nullable(z.string(), "quest or item: the name in the game's own language"),
  giver: Nullable(z.string(), "quest"),
  location: Nullable(z.string(), "quest: where it started; item: where it was found"),
  kind: Nullable(z.string(), `entry: ${ENTRY_KINDS.join(", ")}. item: weapon, handle, amulet, … in the game's terms`),
  text: z.string().optional().describe("entry; goal: the note, or why"),
  spoiler: Spoiler.optional().describe("entry, item or goal: none once the player has found what it names"),
  level: z.number().int().nullable().optional().describe("snapshot"),
  values: z.record(z.string(), z.number()).optional().describe("snapshot: the stats to fix, by key; the others stay"),
  equipped: z.boolean().optional().describe("item"),
  verdict: Nullable(z.string(), "item: how it fits the build, with where you know it from"),
  sources: z
    .array(SourceInput)
    .optional()
    .describe("game: the sites the player trusts; item: where its facts come from. The whole list: a link left out is dropped"),
  characterName: Nullable(z.string(), "playthrough: the character's name"),
  characterClass: Nullable(z.string(), "playthrough: the character's class, in English"),
  characterLocalClass: Nullable(z.string(), "playthrough: the class in the game's own language"),
  target: z.number().optional().describe("goal (stat or level): the new value"),
  suggested: z.boolean().optional().describe("goal: false once the player agreed to a suggestion"),
  rank: z.number().int().min(1).optional().describe("goal: its place in the order, 1 first"),
});
