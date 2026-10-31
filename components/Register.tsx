"use client";
// The register of a playthrough's page: coloured index tabs along the top, like the dividers of a ring binder, one part of the page
// behind each. Every part is rendered on the server and only hidden here, so a link to a quest, an item or a codex entry (#item-…) opens
// the part it is in and scrolls to it, on the first load and when it is followed on the page.
import { Children, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

export type Tab = { key: string; label: string; icon?: ReactNode };

export function Register({ tabs, start, label, children }: { tabs: Tab[]; start: string; label: string; children: ReactNode }) {
  const panels = Children.toArray(children);
  const [at, setAt] = useState(start);
  // What a link named, to scroll to once its part shows; the count makes the scroll happen even when the part is open already.
  const target = useRef<string | null>(null);
  const [, setFollowed] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  // Open the part an element of this register is in and scroll to the element; false when it isn't in here.
  const show = useCallback((elementId: string) => {
    const el = document.getElementById(elementId);
    const part = el && root.current?.contains(el) ? el.closest<HTMLElement>("[data-part]")?.dataset.part : null;
    if (!part) return false;
    // Inside a group the row has hidden (components/Groups.tsx): show them all again first.
    if (el?.closest("[data-group][hidden]")) el.dispatchEvent(new CustomEvent("questlog:reveal", { bubbles: true }));
    target.current = elementId;
    setAt(part);
    setFollowed((n) => n + 1);
    return true;
  }, []);

  useEffect(() => {
    const follow = () => {
      if (window.location.hash.length > 1) show(decodeURIComponent(window.location.hash.slice(1)));
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [show]);

  // Once its part shows, scroll to what the link named.
  useEffect(() => {
    if (!target.current) return;
    document.getElementById(target.current)?.scrollIntoView({ block: "start" });
    target.current = null;
  });

  // A link to something on this page (an equipped item, an open quest, the boss an item is good against) opens it here, also when the
  // address already ends in that #fragment and the browser would do nothing.
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href*='#']");
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const url = new URL(a.href);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return;
    if (show(decodeURIComponent(url.hash.slice(1)))) {
      e.preventDefault();
      window.history.replaceState(window.history.state, "", url.pathname + url.hash);
    }
  };

  const open = (key: string) => {
    setAt(key);
    // Opening a part from further down the page starts it at its top, under the tabs.
    const page = root.current?.closest(".page");
    if (!page || !root.current) return;
    const top = root.current.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop;
    if (page.scrollTop > top) page.scrollTo({ top, behavior: "instant" });
  };

  // Arrow keys move along the tabs, as in any tab list; they don't reach the book, which would turn the page (components/Pages.tsx).
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "Home" ? -i : e.key === "End" ? tabs.length - 1 - i : 0;
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    const next = tabs[(i + step + tabs.length) % tabs.length];
    open(next.key);
    document.getElementById(`${id}-${next.key}`)?.focus();
  };

  return (
    <div ref={root} className="register" data-at={at} onClick={onClick}>
      <div role="tablist" aria-label={label} aria-orientation="horizontal" className="register-tabs">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            id={`${id}-${t.key}`}
            type="button"
            role="tab"
            data-tab={t.key}
            aria-selected={t.key === at}
            aria-controls={`${id}-${t.key}-panel`}
            tabIndex={t.key === at ? 0 : -1}
            className="register-tab"
            onClick={() => open(t.key)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.icon}
            <span className="register-label">{t.label}</span>
          </button>
        ))}
      </div>
      {panels.map((panel, i) => (
        <div
          key={tabs[i].key}
          id={`${id}-${tabs[i].key}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-${tabs[i].key}`}
          data-part={tabs[i].key}
          hidden={tabs[i].key !== at}
          className="register-panel"
        >
          {panel}
        </div>
      ))}
    </div>
  );
}
