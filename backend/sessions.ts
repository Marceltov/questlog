// Play sessions: the player's own words (values V3), which everything filed from them points back to.
import { db } from "./db";
import { getPlaythrough, type PlaythroughView } from "./games";
import { NotFoundError } from "./errors";
import { seen } from "./spoilers";
import type { Player } from "./types";
import { sessionPath } from "./urls";

/** `notes`: the player's own on the session (ADR 0011). */
export type SessionSummary = { id: string; playedOn: string; summary: string; notes: string | null; url: string };
export type SessionView = SessionSummary & { transcript: string; playthrough: PlaythroughView };

/** The sessions of one of the player's playthroughs, newest first. */
export async function sessionsOf(p: Player, playthroughId: string, limit = 50): Promise<SessionSummary[]> {
  await getPlaythrough(p, playthroughId); // NotFoundError for another player's
  const rows = await seen((await db()).selectFrom("sessions"), p, "sessions")
    .select(["id", "played_on", "summary", "notes"])
    .where("playthrough_id", "=", playthroughId)
    .orderBy("played_on", "desc")
    .orderBy("created_at", "desc")
    .limit(limit)
    .execute();
  return rows.map((r) => ({ id: r.id, playedOn: r.played_on, summary: r.summary, notes: r.notes, url: sessionPath(r.id) }));
}

/** One of the player's sessions, with its transcript. */
export async function getSession(p: Player, id: string): Promise<SessionView> {
  const r = await seen((await db()).selectFrom("sessions"), p, "sessions")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  if (!r) throw new NotFoundError("No such session");
  return {
    id: r.id,
    playedOn: r.played_on,
    summary: r.summary,
    notes: r.notes,
    url: sessionPath(r.id),
    transcript: r.transcript,
    playthrough: await getPlaythrough(p, r.playthrough_id),
  };
}
