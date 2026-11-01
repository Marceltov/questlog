"use client";
// The tags in use on a part, in a row at its top (ADR 0014): tapping one shows only the cards that carry it, across the part's folding
// groups; tapping it again shows them all. Every card is rendered on the server and only hidden here: a card without the tag, then a
// group or section (data-tag-scope) left without a card, whose count (data-tag-count) shows what is left. A link to a hidden card
// (components/Register.tsx sends gamepanion:reveal) shows everything again.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Tag } from "lucide-react";

export type TagCount = { name: string; count: number };

export function TagFilter({ tags, label, children }: { tags: TagCount[]; label: string; children: ReactNode }) {
  const [tag, setTag] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reveal = () => setTag(null);
    el.addEventListener("gamepanion:reveal", reveal);
    return () => el.removeEventListener("gamepanion:reveal", reveal);
  }, []);

  // A tag no card carries any more (a refresh after a correction) is let go.
  const picked = tag !== null && tags.some((t) => t.name === tag) ? tag : null;

  // After every render, not only when the tag changes: a refresh after a chat correction brings new cards and counts from the server,
  // and they must be filtered too.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const tag = picked;
    for (const card of el.querySelectorAll<HTMLElement>("[data-tags]"))
      card.hidden = tag !== null && !(JSON.parse(card.dataset.tags ?? "[]") as string[]).includes(tag);
    for (const scope of el.querySelectorAll<HTMLElement>("[data-tag-scope]")) {
      const left = scope.querySelectorAll("[data-tags]:not([hidden])").length;
      scope.hidden = tag !== null && left === 0;
      const count = scope.querySelector<HTMLElement>("[data-tag-count]");
      if (count) count.textContent = tag === null ? count.dataset.tagCount! : String(left);
    }
  });

  return (
    <div ref={root} className="space-y-4">
      {tags.length > 0 && (
        <div role="group" aria-label={label} className="tag-row">
          <span className="tag-row-label" aria-hidden="true">
            <span className="seal">
              <Tag />
            </span>
            {label}
          </span>
          {tags.map((t) => (
            <button key={t.name} type="button" className="tag-chip" aria-pressed={picked === t.name} onClick={() => setTag(picked === t.name ? null : t.name)}>
              {/* The tag's shape is clipped (a notch and a hole); the button around it keeps a whole focus ring. */}
              <span className="tag-shape">
                {t.name}
                <span className="tag-count">{t.count}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
