// Notes and descriptions (ADR 0011). `notes` are the player's own thoughts in their words, on anything they keep: record adds to them, a
// new paragraph each time, and correct replaces them. A `description` says what a thing is, as the game or a guide does: record and
// correct both replace it.

/** `before` with `added` as a new paragraph; unchanged when `added` is empty or already in it. */
export function addNote(before: string | null, added: string | undefined): string | null {
  const a = added?.trim();
  if (!a) return before;
  if (!before) return a;
  return before.includes(a) ? before : `${before}\n\n${a}`;
}
