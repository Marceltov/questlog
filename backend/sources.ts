// Sources (ADR 0008): links the player keeps, with the facts Claude took from them. Gamepanion stores them and never fetches them.
import type { Source, SourceInput } from "./types";

const key = (url: string) => url.trim().replace(/\/+$/, "");

/** The sources stored as JSON text. */
export const parseSources = (json: string): Source[] => JSON.parse(json) as Source[];

/** `before` with `added` merged in: a link already there is replaced by the new one (fresher facts), a new one goes last. */
export function mergeSources(before: Source[], added: SourceInput[], on: string): Source[] {
  const out = [...before];
  for (const a of added) {
    const s: Source = { url: a.url.trim(), title: a.title?.trim() || null, facts: a.facts?.trim() || null, on };
    const i = out.findIndex((x) => key(x.url) === key(s.url));
    if (i === -1) out.push(s);
    else out[i] = { ...s, title: s.title ?? out[i].title, facts: s.facts ?? out[i].facts };
  }
  return out;
}
