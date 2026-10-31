"use client";
// A row of a part's groups at its top (the inventory's Weapons, Key items…, the codex's bosses, people…): tapping one shows only that
// group, All shows every one again, so a group far down is one tap away instead of a long scroll. Every group is rendered on the server
// and only hidden here; a link to something in a hidden group (components/Register.tsx sends questlog:reveal) shows all of them again.
import { Children, useEffect, useRef, useState, type ReactNode } from "react";

export type Group = { key: string; label: string; count: number; icon: ReactNode };

export function Groups({ groups, label, all, children }: { groups: Group[]; label: string; all: string; children: ReactNode }) {
  const panels = Children.toArray(children);
  const [at, setAt] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reveal = () => setAt(null);
    el.addEventListener("questlog:reveal", reveal);
    return () => el.removeEventListener("questlog:reveal", reveal);
  }, [groups.length]);

  // One group needs no row.
  if (groups.length < 2) return <div className="space-y-6">{panels}</div>;
  const total = groups.reduce((n, g) => n + g.count, 0);
  return (
    <div ref={root} className="space-y-4">
      <div role="group" aria-label={label} className="groups">
        <button type="button" className="group-chip" aria-pressed={at === null} onClick={() => setAt(null)}>
          {all}
          <span className="group-count">{total}</span>
        </button>
        {groups.map((g) => (
          <button key={g.key} type="button" className="group-chip" aria-pressed={at === g.key} onClick={() => setAt(g.key)}>
            {g.icon}
            {g.label}
            <span className="group-count">{g.count}</span>
          </button>
        ))}
      </div>
      <div className="space-y-6">
        {panels.map((panel, i) => (
          <div key={groups[i].key} data-group={groups[i].key} hidden={at !== null && at !== groups[i].key}>
            {panel}
          </div>
        ))}
      </div>
    </div>
  );
}
