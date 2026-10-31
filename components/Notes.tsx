import { serverCopy } from "@/components/copy/server";

// What a thing is (as the game says), then the player's own notes on it (ADR 0011), each only when there is one.
export async function Notes({ description, notes }: { description?: string | null; notes?: string | null }) {
  const copy = await serverCopy();
  return (
    <>
      {description && <p className="mt-1 text-sm whitespace-pre-line text-muted">{description}</p>}
      {notes && (
        <p className="player-note" aria-label={copy.yourNotes}>
          {notes}
        </p>
      )}
    </>
  );
}
