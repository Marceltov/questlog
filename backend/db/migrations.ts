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
};

export const NEWER = "the database was made by a newer questlog than this one; upgrade questlog, do not point an older one at it";

export async function migrate(db: Kysely<any>): Promise<void> {
  const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } });
  const { error } = await migrator.migrateToLatest();
  if (!error) return;
  if (error instanceof Error && /migration/i.test(error.message) && /missing/i.test(error.message)) throw new Error(NEWER);
  throw error;
}
