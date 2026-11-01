// Schema changes, in order. Never edit one that has shipped; add the next. Kept in code, not files, so the standalone build has nothing
// extra to trace. Kysely's Migrator records what ran in `kysely_migration`.
// The migrations run against whatever the schema was when they were written, so the database is untyped here.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Kysely, sql } from "kysely";
import { Migrator, type Migration } from "kysely/migration";

// The vocabularies of backend/types.ts as they were when this migration was written, checked by the database as well: a write path that
// forgets to check a value still can't store a bad one.
const oneOf = (column: string, values: readonly string[]) => sql`${sql.ref(column)} in (${sql.join(values.map((v) => sql.lit(v)))})`;
const SPOILER = ["none", "hint", "full"];

// Every id is a text UUID, every time a bigint in ms. `player_id` is Better Auth's user id; it lives in auth.sqlite, so there is no
// foreign key to it (ADR 0004): deleting a player deletes their rows in auth.ts's hook. Deleting a game takes its playthroughs, and a
// playthrough its sessions, quests, build and items. A deleted session leaves what was filed from it, without the link.
const migrations: Record<string, Migration> = {
  "001_initial": {
    async up(db: Kysely<any>) {
      const player = (c: any) => c.notNull();
      const session = (c: any) => c.references("sessions.id").onDelete("set null");
      const playthrough = (c: any) => c.notNull().references("playthroughs.id").onDelete("cascade");
      await db.schema
        .createTable("games")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("player_id", "text", player)
        .addColumn("title", "text", (c) => c.notNull())
        .addColumn("norm", "text", (c) => c.notNull())
        .addColumn("platform", "text")
        .addColumn("stats", "text", (c) => c.notNull().defaultTo("[]")) // the game's stat names, as data (values V8)
        .addColumn("created_at", "bigint", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("games_by_player").unique().on("games").columns(["player_id", "norm"]).execute();
      await db.schema
        .createTable("playthroughs")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("player_id", "text", player)
        .addColumn("game_id", "text", (c) => c.notNull().references("games.id").onDelete("cascade"))
        .addColumn("label", "text", (c) => c.notNull())
        .addColumn("language", "text")
        .addColumn("status", "text", (c) => c.notNull().check(oneOf("status", ["playing", "finished", "dropped"])))
        .addColumn("last_played_on", "text")
        .addColumn("created_at", "bigint", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("playthroughs_by_player").on("playthroughs").columns(["player_id", "game_id"]).execute();
      await db.schema
        .createTable("sessions")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("player_id", "text", player)
        .addColumn("playthrough_id", "text", playthrough)
        .addColumn("played_on", "text", (c) => c.notNull())
        .addColumn("summary", "text", (c) => c.notNull())
        .addColumn("transcript", "text", (c) => c.notNull())
        .addColumn("created_at", "bigint", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("sessions_by_playthrough").on("sessions").columns(["playthrough_id", "played_on"]).execute();
      await db.schema
        .createTable("quests")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("player_id", "text", player)
        .addColumn("playthrough_id", "text", playthrough)
        .addColumn("name", "text", (c) => c.notNull())
        .addColumn("norm", "text", (c) => c.notNull())
        .addColumn("local_name", "text")
        .addColumn("giver", "text")
        .addColumn("location", "text")
        .addColumn("status", "text", (c) => c.notNull().check(oneOf("status", ["open", "blocked", "done", "failed", "dropped"])))
        .addColumn("spoiler", "text", (c) => c.notNull().check(oneOf("spoiler", SPOILER)))
        .addColumn("session_id", "text", session)
        .addColumn("created_at", "bigint", (c) => c.notNull())
        .addColumn("updated_at", "bigint", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("quests_by_name").unique().on("quests").columns(["playthrough_id", "norm"]).execute();
      await db.schema
        .createTable("quest_entries")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("player_id", "text", player)
        .addColumn("quest_id", "text", (c) => c.notNull().references("quests.id").onDelete("cascade"))
        .addColumn("session_id", "text", session)
        .addColumn("kind", "text", (c) => c.notNull().check(oneOf("kind", ["log", "next", "decision"])))
        .addColumn("text", "text", (c) => c.notNull())
        .addColumn("spoiler", "text", (c) => c.notNull().check(oneOf("spoiler", SPOILER)))
        .addColumn("created_at", "bigint", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("quest_entries_by_quest").on("quest_entries").columns(["quest_id", "created_at"]).execute();
      await db.schema
        .createTable("build_plans")
        .addColumn("playthrough_id", "text", (c) => c.primaryKey().references("playthroughs.id").onDelete("cascade"))
        .addColumn("player_id", "text", player)
        .addColumn("summary", "text")
        .addColumn("main_stat", "text")
        .addColumn("targets", "text", (c) => c.notNull().defaultTo("{}"))
        .addColumn("updated_at", "bigint", (c) => c.notNull())
        .execute();
      await db.schema
        .createTable("stat_snapshots")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("player_id", "text", player)
        .addColumn("playthrough_id", "text", playthrough)
        .addColumn("session_id", "text", session)
        .addColumn("taken_on", "text", (c) => c.notNull())
        .addColumn("level", "integer")
        .addColumn("stats", "text", (c) => c.notNull().defaultTo("{}"))
        .addColumn("created_at", "bigint", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("stat_snapshots_by_playthrough").on("stat_snapshots").columns(["playthrough_id", "taken_on"]).execute();
      await db.schema
        .createTable("items")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("player_id", "text", player)
        .addColumn("playthrough_id", "text", playthrough)
        .addColumn("session_id", "text", session)
        .addColumn("name", "text", (c) => c.notNull())
        .addColumn("norm", "text", (c) => c.notNull())
        .addColumn("local_name", "text")
        .addColumn("kind", "text")
        .addColumn("location", "text")
        .addColumn("equipped", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("verdict", "text")
        .addColumn("spoiler", "text", (c) => c.notNull().check(oneOf("spoiler", SPOILER)))
        .addColumn("created_at", "bigint", (c) => c.notNull())
        .addColumn("updated_at", "bigint", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("items_by_name").unique().on("items").columns(["playthrough_id", "norm"]).execute();
    },
  },
  // Sources (ADR 0008): the pages the player trusts for a game, and the pages an item's facts come from, each a JSON list of
  // { url, title, facts, on }. Gamepanion never fetches them; Claude reads them in the conversation.
  "002_sources": {
    async up(db: Kysely<any>) {
      await db.schema
        .alterTable("games")
        .addColumn("sources", "text", (c) => c.notNull().defaultTo("[]"))
        .execute();
      await db.schema
        .alterTable("items")
        .addColumn("sources", "text", (c) => c.notNull().defaultTo("[]"))
        .execute();
    },
  },
  // Goals and the character (ADR 0009). A goal is a row of its own, apart from the snapshots of what happened: ranked, with a status that
  // stays (a dropped goal is kept), the session it was decided in, and whether it is only a suggestion yet. The build plan's targets
  // become stat goals; the column stays (a shipped migration made it) and is no longer written. The character is the playthrough's.
  "003_goals": {
    async up(db: Kysely<any>) {
      const player = (c: any) => c.notNull();
      const session = (c: any) => c.references("sessions.id").onDelete("set null");
      const playthrough = (c: any) => c.notNull().references("playthroughs.id").onDelete("cascade");
      await db.schema
        .createTable("goals")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("player_id", "text", player)
        .addColumn("playthrough_id", "text", playthrough)
        .addColumn("session_id", "text", session)
        .addColumn("kind", "text", (c) => c.notNull().check(oneOf("kind", ["stat", "level", "item", "note"])))
        .addColumn("stat", "text")
        .addColumn("target", "real")
        .addColumn("item_id", "text", (c) => c.references("items.id").onDelete("set null"))
        .addColumn("text", "text")
        .addColumn("rank", "integer", (c) => c.notNull())
        .addColumn("status", "text", (c) => c.notNull().check(oneOf("status", ["open", "reached", "dropped"])))
        .addColumn("suggested", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("spoiler", "text", (c) => c.notNull().check(oneOf("spoiler", SPOILER)))
        .addColumn("reached_on", "text")
        .addColumn("created_at", "bigint", (c) => c.notNull())
        .addColumn("updated_at", "bigint", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("goals_by_playthrough").on("goals").columns(["playthrough_id", "rank"]).execute();
      for (const col of ["character_name", "character_class", "character_local_class"])
        await db.schema.alterTable("playthroughs").addColumn(col, "text").execute();

      // Each plan's targets, in the order they were written, as the player's goals; reached where the latest snapshot is there already.
      const plans = await db.selectFrom("build_plans").select(["playthrough_id", "player_id", "targets", "updated_at"]).execute();
      for (const plan of plans) {
        const latest = await db
          .selectFrom("stat_snapshots")
          .select(["stats", "taken_on"])
          .where("playthrough_id", "=", plan.playthrough_id)
          .orderBy("taken_on", "desc")
          .orderBy("created_at", "desc")
          .executeTakeFirst();
        const values = latest ? (JSON.parse(latest.stats) as Record<string, number>) : {};
        const targets = Object.entries(JSON.parse(plan.targets) as Record<string, number>);
        for (const [i, [stat, target]] of targets.entries()) {
          const reached = values[stat] !== undefined && values[stat] >= target;
          await db
            .insertInto("goals")
            .values({
              id: crypto.randomUUID(),
              player_id: plan.player_id,
              playthrough_id: plan.playthrough_id,
              session_id: null,
              kind: "stat",
              stat,
              target,
              item_id: null,
              text: null,
              rank: i + 1,
              status: reached ? "reached" : "open",
              suggested: 0,
              spoiler: "none",
              reached_on: reached ? latest!.taken_on : null,
              created_at: plan.updated_at,
              updated_at: plan.updated_at,
            })
            .execute();
        }
      }
    },
  },
  // The tracker (ADR 0010). The inventory: an item's quantity and its numbers as data ({ key: value }, named as the game names them). The
  // codex: the bosses, enemies, NPCs and places the player met, with weaknesses, resistances and a strategy. What an item is good
  // against links the two.
  "004_tracker": {
    async up(db: Kysely<any>) {
      const player = (c: any) => c.notNull();
      const session = (c: any) => c.references("sessions.id").onDelete("set null");
      const playthrough = (c: any) => c.notNull().references("playthroughs.id").onDelete("cascade");
      await db.schema.alterTable("items").addColumn("quantity", "integer").execute();
      await db.schema
        .alterTable("items")
        .addColumn("attributes", "text", (c) => c.notNull().defaultTo("{}"))
        .execute();
      await db.schema
        .createTable("codex")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("player_id", "text", player)
        .addColumn("playthrough_id", "text", playthrough)
        .addColumn("session_id", "text", session)
        .addColumn("kind", "text", (c) => c.notNull().check(oneOf("kind", ["boss", "enemy", "npc", "place"])))
        .addColumn("name", "text", (c) => c.notNull())
        .addColumn("norm", "text", (c) => c.notNull())
        .addColumn("local_name", "text")
        .addColumn("location", "text")
        .addColumn("status", "text", (c) => c.notNull().check(oneOf("status", ["met", "beaten", "gone"])))
        .addColumn("attempts", "integer")
        .addColumn("beaten_on", "text")
        .addColumn("weaknesses", "text", (c) => c.notNull().defaultTo("[]"))
        .addColumn("resistances", "text", (c) => c.notNull().defaultTo("[]"))
        .addColumn("strategy", "text")
        .addColumn("notes", "text")
        .addColumn("spoiler", "text", (c) => c.notNull().check(oneOf("spoiler", SPOILER)))
        .addColumn("sources", "text", (c) => c.notNull().defaultTo("[]"))
        .addColumn("created_at", "bigint", (c) => c.notNull())
        .addColumn("updated_at", "bigint", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("codex_by_name").unique().on("codex").columns(["playthrough_id", "kind", "norm"]).execute();
      await db.schema
        .createTable("item_uses")
        .addColumn("item_id", "text", (c) => c.notNull().references("items.id").onDelete("cascade"))
        .addColumn("codex_id", "text", (c) => c.notNull().references("codex.id").onDelete("cascade"))
        .addColumn("player_id", "text", player)
        .addColumn("effect", "text", (c) =>
          c
            .notNull()
            .defaultTo("good")
            .check(oneOf("effect", ["very good", "good", "neutral", "bad", "very bad"])),
        )
        .addColumn("note", "text")
        .addColumn("created_at", "bigint", (c) => c.notNull())
        .addPrimaryKeyConstraint("item_uses_pk", ["item_id", "codex_id"])
        .execute();
      await db.schema.createIndex("item_uses_by_codex").on("item_uses").columns(["codex_id"]).execute();
      // A game's inventory groups (ItemKind), seeded from the kinds its items have, in the order the inventory showed them so far.
      await db.schema
        .alterTable("games")
        .addColumn("item_kinds", "text", (c) => c.notNull().defaultTo("[]"))
        .execute();
      const NAMES: Record<string, string> = {
        weapon: "Weapons",
        blade: "Blades",
        handle: "Handles",
        armour: "Armour",
        amulet: "Amulets",
        consumable: "Consumables",
        material: "Upgrade materials",
        collectible: "Collectibles",
        key: "Key items",
      };
      const ORDER = Object.keys(NAMES);
      const used = await db
        .selectFrom("items")
        .innerJoin("playthroughs", "playthroughs.id", "items.playthrough_id")
        .select(["playthroughs.game_id", "items.kind"])
        .distinct()
        .where("items.kind", "is not", null)
        .execute();
      const byGame = new Map<string, string[]>();
      for (const u of used) byGame.set(u.game_id, [...(byGame.get(u.game_id) ?? []), u.kind]);
      for (const [gameId, kinds] of byGame) {
        const rank = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length);
        const list = kinds.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((key) => ({ key, name: NAMES[key] ?? key, localName: null }));
        await db
          .updateTable("games")
          .set({ item_kinds: JSON.stringify(list) })
          .where("id", "=", gameId)
          .execute();
      }
    },
  },
  "005_notes": {
    // ADR 0011: the player's own notes on everything they keep, and a description of what a thing is.
    async up(db: Kysely<any>) {
      for (const table of ["games", "playthroughs", "sessions", "quests", "stat_snapshots", "items", "goals"])
        await db.schema.alterTable(table).addColumn("notes", "text").execute();
      for (const table of ["games", "quests", "items", "codex"]) await db.schema.alterTable(table).addColumn("description", "text").execute();
    },
  },
  "006_chat_usage": {
    // ADR 0013: how many chat messages a player sent on a day, for the daily limit. Nothing of what was said.
    async up(db: Kysely<any>) {
      await db.schema
        .createTable("chat_usage")
        .addColumn("player_id", "text", (c) => c.notNull())
        .addColumn("day", "text", (c) => c.notNull())
        .addColumn("count", "integer", (c) => c.notNull().defaultTo(0))
        .addPrimaryKeyConstraint("chat_usage_pk", ["player_id", "day"])
        .execute();
    },
  },
  "007_tags": {
    // ADR 0014: a game's tags, made up as they're needed, and which items, codex entries and quests carry them. A link points into one
    // of three tables, so no foreign key holds it: triggers delete a row's links with the row (also when a playthrough's cascade takes
    // it), and a tag with no links left.
    async up(db: Kysely<any>) {
      await db.schema
        .createTable("tags")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("player_id", "text", (c) => c.notNull())
        .addColumn("game_id", "text", (c) => c.notNull().references("games.id").onDelete("cascade"))
        .addColumn("name", "text", (c) => c.notNull())
        .addColumn("norm", "text", (c) => c.notNull())
        .addColumn("created_at", "bigint", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("tags_by_name").on("tags").columns(["game_id", "norm"]).unique().execute();
      await db.schema
        .createTable("tag_links")
        .addColumn("tag_id", "text", (c) => c.notNull().references("tags.id").onDelete("cascade"))
        .addColumn("player_id", "text", (c) => c.notNull())
        .addColumn("what", "text", (c) => c.notNull().check(oneOf("what", ["item", "codex", "quest"])))
        .addColumn("row_id", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint("tag_links_pk", ["tag_id", "what", "row_id"])
        .execute();
      await db.schema.createIndex("tag_links_by_row").on("tag_links").columns(["what", "row_id"]).execute();
      for (const [table, what] of [
        ["items", "item"],
        ["codex", "codex"],
        ["quests", "quest"],
      ])
        await sql`create trigger ${sql.raw(`${table}_untag`)} after delete on ${sql.table(table)} begin
          delete from tag_links where what = ${sql.lit(what)} and row_id = old.id;
        end`.execute(db);
      await sql`create trigger tags_unused after delete on tag_links begin
        delete from tags where id = old.tag_id and not exists (select 1 from tag_links where tag_id = old.tag_id);
      end`.execute(db);
    },
  },
  "008_settings": {
    // ADR 0016: how much Claude adds on its own and how many spoilers show, per playthrough; and what it adds, as background lines on
    // items, codex entries and quests, each with its own spoiler level. A line points into one of three tables, so triggers delete a
    // row's lines with the row, as 007's do for tag links.
    async up(db: Kysely<any>) {
      await db.schema
        .alterTable("playthroughs")
        .addColumn("background", "text", (c) =>
          c
            .notNull()
            .defaultTo("none")
            .check(oneOf("background", ["none", "light", "useful", "everything"])),
        )
        .execute();
      await db.schema
        .alterTable("playthroughs")
        .addColumn("spoilers", "text", (c) =>
          c
            .notNull()
            .defaultTo("none")
            .check(oneOf("spoilers", ["none", "hint", "full"])),
        )
        .execute();
      await db.schema
        .createTable("background")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("player_id", "text", (c) => c.notNull())
        .addColumn("what", "text", (c) => c.notNull().check(oneOf("what", ["item", "codex", "quest"])))
        .addColumn("row_id", "text", (c) => c.notNull())
        .addColumn("text", "text", (c) => c.notNull())
        .addColumn("spoiler", "text", (c) =>
          c
            .notNull()
            .defaultTo("none")
            .check(oneOf("spoiler", ["none", "hint", "full"])),
        )
        .addColumn("source_url", "text")
        .addColumn("source_title", "text")
        .addColumn("created_at", "bigint", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("background_by_row").on("background").columns(["what", "row_id"]).execute();
      for (const [table, what] of [
        ["items", "item"],
        ["codex", "codex"],
        ["quests", "quest"],
      ])
        await sql`create trigger ${sql.raw(`${table}_unbackground`)} after delete on ${sql.table(table)} begin
          delete from background where what = ${sql.lit(what)} and row_id = old.id;
        end`.execute(db);
    },
  },
};

export const NEWER = "the database was made by a newer Gamepanion than this one; upgrade Gamepanion, do not point an older one at it";

export async function migrate(db: Kysely<any>): Promise<void> {
  const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } });
  const { error } = await migrator.migrateToLatest();
  if (!error) return;
  if (error instanceof Error && /migration/i.test(error.message) && /missing/i.test(error.message)) throw new Error(NEWER);
  throw error;
}
