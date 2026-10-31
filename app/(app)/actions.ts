"use server";
// The page's own writes. A playthrough's settings (ADR 0016) go through correct, as when the player tells Claude: the same checks, and
// only the signed-in player's own playthrough.
import { correct, type BackgroundLevel, type SpoilerLevel } from "@/backend";
import { pagePlayer } from "./viewer";

export async function saveSettings(playthroughId: string, settings: { background?: BackgroundLevel; spoilers?: SpoilerLevel }): Promise<void> {
  const p = await pagePlayer();
  await correct(p, [{ what: "playthrough", id: playthroughId, background: settings.background, spoilers: settings.spoilers }]);
}
