// The input of the writes, shared by /mcp (tools.ts) and /api/v1 (http/api.ts), so both take the same thing. The descriptions are written
// for Claude, who reads them as the tool's schema; they read as well in the OpenAPI description.
import * as z from "zod";
import { TARGETS } from "./correct";
import { DAY } from "./dates";
import {
  CODEX_KINDS,
  CODEX_STATUSES,
  EFFECTS,
  ENTRY_KINDS,
  GOAL_KINDS,
  ITEM_KINDS,
  GOAL_STATUSES,
  PLAYTHROUGH_STATUSES,
  QUEST_STATUSES,
  SPOILER_LEVELS,
} from "./types";

export const Spoiler = z.enum(SPOILER_LEVELS);
export const TagNames = z
  .array(z.string().trim().min(1).max(40))
  .max(10)
  .describe(
    "Its tags: free names to filter by across groups, like an element or a status effect. Reuse the game's tags (briefing, item and codex list them); a new one only for an idea none of them covers; one tag per idea (fire, not fire damage and fire resistance). Replaces the tags it has; leave it out to keep them",
  );
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

// ADR 0011: the player's own thoughts, in their words, never yours; added to the notes a row has.
export const Notes = z.string().describe("The player's own thoughts on it, in their words (never yours); added to the notes it has");
// What a thing is, as the game or a guide puts it; replaces the description it has.
export const Description = z.string().describe("What it is, as the game describes it (from a screenshot or the player); replaces the one it has");

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
  notes: Notes.optional(),
});

export const Attributes = z
  .record(z.string(), z.union([z.string(), z.number()]))
  .describe(
    'Its numbers as the game shows them, by the game\'s names, from a screenshot or what the player says: { "Physical ATK": 119, "Technique": "C", "Weight": 11.4 }',
  );

export const Against = z
  .array(
    z.object({
      target: z.string().describe("A codex entry (boss, enemy, NPC): its id or exact name"),
      effect: z
        .enum(EFFECTS)
        .optional()
        .describe(
          "How well it works on them, as the player found or a guide says. very good: its weak spot; good (the default): use it; neutral: no better or worse; bad: they resist it; very bad: they heal from it or it backfires",
        ),
      note: z.string().optional().describe("How or why: fire against a weak spot, throw before the second phase; it heals from fire"),
    }),
  )
  .describe("What the item works on, and how well");

export const ItemKinds = z
  .array(
    z.object({
      key: z.string().describe("What items' kind holds: amulet, ring, consumable; an existing group's key renames it"),
      name: z.string().optional().describe("The group's name in English, as a heading: Amulets, Rings, Talismans"),
      localName: z.string().nullable().optional().describe("The name in the game's own language: Amulette"),
    }),
  )
  .describe("The game's inventory groups: games call them differently, so the player names and orders them");

export const CodexInput = z.object({
  id: z.string().optional().describe("An existing entry's id, from codex or briefing"),
  kind: z.enum(CODEX_KINDS).optional().describe("For a new entry: boss, enemy (a regular foe), npc or place"),
  name: z.string().describe("Its name; an exact match of the same kind updates that entry"),
  localName: z.string().optional().describe("Its name in the game's own language"),
  location: z.string().optional().describe("Where the player met it"),
  status: z
    .enum(CODEX_STATUSES)
    .optional()
    .describe("met (default for a new one), beaten for a boss or enemy the player defeated, gone for an NPC dead or left, or a boss skipped"),
  attempts: z.number().int().min(0).optional().describe("A boss: the player's tries so far, as they count them"),
  weaknesses: z.array(z.string()).optional().describe("What hurts it (fire, electric blitz, a weak spot); added to those it has"),
  resistances: z.array(z.string()).optional().describe("What it shrugs off; added to those it has"),
  strategy: z.string().optional().describe("How to go about it, as the player found or decided; from a guide, with sources and a spoiler level"),
  description: Description.optional().describe(
    "What it is: an NPC's role and wares, a place's rest point and shortcuts, a boss's lore as the game tells it; replaces the one it has",
  ),
  notes: Notes.optional(),
  spoiler: Spoiler.optional().describe("Default none: what the player met. hint or full for what comes from your knowledge or a guide and gives away more"),
  sources: z.array(SourceInput).optional().describe("The pages its weaknesses or strategy come from, with the facts; merged by link"),
  tags: TagNames.optional(),
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
        description: Description.optional(),
        notes: Notes.optional(),
        giver: z.string().optional().describe("Who gave it"),
        tags: TagNames.optional(),
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
      notes: Notes.optional().describe("The player's own thoughts on where the build stands"),
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
        description: Description.optional(),
        notes: Notes.optional(),
        kind: z
          .string()
          .optional()
          .describe(
            `The inventory group: a key, name or local name of one of the game's groups (game.itemKinds), else a new group in the game's terms (${ITEM_KINDS.join(", ")}, ring, talisman)`,
          ),
        quantity: z.number().int().min(0).optional().describe("How many the player has now, for consumables, materials and collectibles"),
        attributes: Attributes.optional(),
        against: Against.optional(),
        location: z.string().optional().describe("Where it was found"),
        tags: TagNames.optional(),
        equipped: z.boolean().optional(),
        verdict: z.string().optional().describe("How it fits the build, with where you know it from"),
        spoiler: Spoiler.optional().describe("Default none. hint or full when the verdict names what the player hasn't reached"),
        sources: z.array(SourceInput).optional().describe("The pages you took its facts from, with the facts; merged by link into those it has"),
      }),
    )
    .optional()
    .describe("The player's inventory: items they found, used up, equipped or put away"),
  itemKinds: ItemKinds.optional().describe(
    "Names the game's inventory groups when the player says what the game calls them; a group named by key gets the names, a new one goes last",
  ),
  codex: z
    .array(CodexInput)
    .optional()
    .describe("Bosses, enemies, NPCs and places the player met in this session, or what they learned about them: weaknesses, a strategy, a boss beaten"),
  sources: z
    .array(SourceInput)
    .optional()
    .describe("Sites the player trusts for this game (a wiki, a guide), where you look things up when they ask; merged by link"),
  notes: z
    .object({ game: Notes.optional(), playthrough: Notes.optional(), session: Notes.optional() })
    .optional()
    .describe("The player's own thoughts on the game as a whole, on this run, or on this session; each added to the notes it has"),
  gameDescription: Description.optional().describe("What the game is; replaces the one it has"),
});

export const Nullable = (s: z.ZodString, what: string) => s.nullable().optional().describe(`${what}; null clears it`);

export const ChangeInput = z.object({
  what: z
    .enum(TARGETS)
    .describe(
      "The kind of row: game, playthrough, session, quest, entry (a quest's log line), snapshot (stats), item, goal or codex (a boss, enemy, NPC or place)",
    ),
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
      `playthrough: ${PLAYTHROUGH_STATUSES.join(", ")}. quest: ${QUEST_STATUSES.join(", ")}; done only when the player said they finished it. goal: ${GOAL_STATUSES.join(", ")}. codex: ${CODEX_STATUSES.join(", ")}`,
    ),
  summary: z.string().optional().describe("session"),
  playedOn: Day.optional().describe("session (its snapshot moves with it) or snapshot: the day"),
  name: z.string().optional().describe("quest, item or codex"),
  localName: Nullable(z.string(), "quest, item or codex: the name in the game's own language"),
  giver: Nullable(z.string(), "quest"),
  location: Nullable(z.string(), "quest: where it started; item: where it was found; codex: where the player met it"),
  kind: Nullable(z.string(), `entry: ${ENTRY_KINDS.join(", ")}. item: ${ITEM_KINDS.join(", ")}, or the game's term`),
  text: z.string().optional().describe("entry; goal: the note, or why"),
  spoiler: Spoiler.optional().describe("entry, item, goal or codex: none once the player has found what it names"),
  level: z.number().int().nullable().optional().describe("snapshot"),
  values: z.record(z.string(), z.number()).optional().describe("snapshot: the stats to fix, by key; the others stay"),
  equipped: z.boolean().optional().describe("item"),
  verdict: Nullable(z.string(), "item: how it fits the build, with where you know it from"),
  sources: z
    .array(SourceInput)
    .optional()
    .describe("game: the sites the player trusts; item or codex: where its facts come from. The whole list: a link left out is dropped"),
  characterName: Nullable(z.string(), "playthrough: the character's name"),
  characterClass: Nullable(z.string(), "playthrough: the character's class, in English"),
  characterLocalClass: Nullable(z.string(), "playthrough: the class in the game's own language"),
  target: z.number().optional().describe("goal (stat or level): the new value"),
  suggested: z.boolean().optional().describe("goal: false once the player agreed to a suggestion"),
  rank: z.number().int().min(1).optional().describe("goal: its place in the order, 1 first"),
  quantity: z.number().int().min(0).nullable().optional().describe("item: how many; null when it isn't counted"),
  attributes: Attributes.optional().describe("item: its numbers, all of them: a key left out is dropped"),
  against: Against.optional().describe("item: what it is good or bad against, all of it: a link left out is dropped"),
  itemKinds: ItemKinds.optional().describe("game: its inventory groups, all of them in the player's order; one that items still use can't go"),
  attempts: z.number().int().min(0).nullable().optional().describe("codex (boss): the tries so far"),
  weaknesses: z.array(z.string()).optional().describe("codex: all of them"),
  resistances: z.array(z.string()).optional().describe("codex: all of them"),
  strategy: Nullable(z.string(), "codex"),
  description: Nullable(z.string(), "game, quest, item or codex: what it is"),
  notes: Nullable(z.string(), "every target but entry: the player's own notes, all of them (this replaces them)"),
});
