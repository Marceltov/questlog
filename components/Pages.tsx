"use client";
// Turning the pages of the book (#12). The pages sit side by side in one horizontal scroller with CSS scroll-snap, so a swipe on the
// phone is the browser's own, with no gesture library; each page scrolls up and down on its own and keeps its place while you are on
// another. Arrow keys and the arrows at the sides turn pages on a desktop; the ribbon marks at the bottom say where you are. The address
// follows the page (history.replaceState), so a link Claude handed out still opens the page it names, and the back button doesn't step
// through every page you turned.
import { Children, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

type Page = { key: string; title: string; href: string };

export function Pages({
  pages,
  start,
  labels,
  children,
}: {
  pages: Page[];
  start: number;
  labels: { previous: string; next: string; pages: string };
  children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(start);
  const atRef = useRef(start);
  const sheets = Children.toArray(children);

  const turn = useCallback(
    (i: number) => {
      const el = scroller.current;
      if (!el || i < 0 || i >= pages.length) return;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollTo({ left: i * el.clientWidth, behavior: still ? "instant" : "smooth" });
    },
    [pages.length],
  );

  // Open at the page the address names, before the first paint, then at the quest or item its #fragment names.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: start * el.clientWidth, behavior: "instant" });
    atRef.current = start;
    setAt(start);
    const target = window.location.hash.length > 1 ? document.getElementById(decodeURIComponent(window.location.hash.slice(1))) : null;
    target?.scrollIntoView({ block: "start", inline: "nearest" });
  }, [start]);

  // The page in view is the one the scroller has snapped to; the address follows it.
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i === atRef.current || !pages[i]) return;
    atRef.current = i;
    setAt(i);
    window.history.replaceState(window.history.state, "", pages[i].href);
  }, [pages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") turn(atRef.current - 1);
      else if (e.key === "ArrowRight") turn(atRef.current + 1);
      else return;
      e.preventDefault();
    };
    // A resized window keeps its page: the scroller would otherwise sit between two.
    const onResize = () => {
      const el = scroller.current;
      if (el) el.scrollTo({ left: atRef.current * el.clientWidth, behavior: "instant" });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [turn]);

  // A link to another page of the book (data-page, on the contents) turns to it instead of loading it again.
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[data-page]");
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    turn(Number(a.dataset.page));
  };

  return (
    <div className="relative h-full">
      <div ref={scroller} className="pages" onScroll={onScroll} onClick={onClick}>
        {sheets.map((sheet, i) => (
          <section key={pages[i].key} className="page" aria-label={pages[i].title}>
            {sheet}
          </section>
        ))}
      </div>
      {pages.length > 1 && (
        <>
          <button type="button" className="page-arrow left-2" onClick={() => turn(at - 1)} disabled={at === 0} aria-label={labels.previous}>
            ‹
          </button>
          <button type="button" className="page-arrow right-2" onClick={() => turn(at + 1)} disabled={at === pages.length - 1} aria-label={labels.next}>
            ›
          </button>
          <nav className="ribbons" aria-label={labels.pages}>
            {pages.map((p, i) => (
              <button
                key={p.key}
                type="button"
                className="ribbon"
                aria-current={i === at ? "page" : undefined}
                aria-label={p.title}
                title={p.title}
                onClick={() => turn(i)}
              />
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
