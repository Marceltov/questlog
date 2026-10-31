import { copy } from "@/components/copy";

// What a thing is (as the game says), then the player's own notes on it (ADR 0011), each only when there is one.
export function Notes({ description, notes }: { description?: string | null; notes?: string | null }) {
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
