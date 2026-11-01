// A player is Better Auth's user (ADR 0004). Their log lives in gamepanion.sqlite with their id on every row; this is what goes when they go.
import { db } from "./db";
import { seen } from "./spoilers";
import type { Player } from "./types";

/** Deletes everything the player recorded. Games cascade to playthroughs, and playthroughs to sessions, quests, builds and items. */
export async function deletePlayerLog(p: Player): Promise<void> {
  await seen((await db()).deleteFrom("games"), p, "games").execute();
}
