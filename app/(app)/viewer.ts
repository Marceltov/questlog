import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { NotFoundError, playerFromHeaders, type Player } from "@/backend";

// Who is looking at a page. The proxy has seen a session cookie; one that is no longer valid goes back to /login.
export async function pagePlayer(): Promise<Player> {
  const p = await playerFromHeaders(await headers());
  if (!p) redirect("/login");
  return p;
}

/** The value, or the 404 page for something that doesn't exist or isn't the player's. */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}
