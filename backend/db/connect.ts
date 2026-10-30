// Opens a SQLite file (or an in-memory database for tests). The driver is imported here, on first use.
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";

export async function openSqlite(file: string): Promise<BetterSqlite3.Database> {
  const { default: Database } = await import("better-sqlite3");
  if (file !== ":memory:") await mkdir(/*turbopackIgnore: true*/ dirname(file), { recursive: true });
  const database = new Database(file);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON"); // the cascades that delete a playthrough's quests, items and sessions
  return database;
}

export async function connect<Schema>(file: string): Promise<Kysely<Schema>> {
  return new Kysely<Schema>({ dialect: new SqliteDialect({ database: await openSqlite(file) }) });
}
