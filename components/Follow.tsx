"use client";
// The pages follow what Claude files while they are open: they fetch again when the app comes back to the front (after switching over
// from Claude), when the network returns, and every little while as long as they are in view. router.refresh() renders the server
// components again and keeps everything on the client: the page turned to, where each page is scrolled.
//
// And a pull to fetch now, for the home-screen app, which has no browser to reload it. The window doesn't scroll (the header stays and
// each page scrolls on its own), so the browser's own pull-to-refresh never happens; this one starts when the page under the finger is
// at its top and the finger moves down, not sideways (that turns the page). What comes down is the bookmark ribbon of the app's icon:
// it turns ember once it is long enough, and letting go then fetches.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { copy } from "./copy";

const EVERY_MS = 20_000;
const ARMED_PX = 64;
const MAX_PX = 104;

/** The nearest element between `from` and `stop` that scrolls up and down and isn't at its top. */
function scrolledAncestor(from: EventTarget | null, stop: HTMLElement): Element | null {
  for (let el = from instanceof Element ? from : null; el && el !== stop.parentElement; el = el.parentElement) {
    const y = getComputedStyle(el).overflowY;
    if ((y === "auto" || y === "scroll") && el.scrollTop > 0) return el;
  }
  return null;
}

export function Follow({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Two transitions: the quiet fetches show nothing, the one a pull started keeps the ribbon down until it is done.
  const [, startQuiet] = useTransition();
  const [pending, startPulled] = useTransition();
  const [pull, setPull] = useState(0);
  const area = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => startQuiet(() => router.refresh()), [router]);
  const pulled = useCallback(() => startPulled(() => router.refresh()), [router]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && refresh();
    const timer = setInterval(() => document.visibilityState === "visible" && refresh(), EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
    };
  }, [refresh]);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    // null: no pull (not at the top, or turning a page); undefined: not decided yet.
    let start: { x: number; y: number } | null = null;
    let vertical: boolean | undefined;
    let length = 0;

    const onStart = (e: TouchEvent) => {
      start = e.touches.length === 1 && !scrolledAncestor(e.target, el) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
      vertical = undefined;
      length = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (vertical === undefined) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        vertical = dy > 0 && Math.abs(dy) > Math.abs(dx);
      }
      if (!vertical) return void (start = null);
      // Held back the further it goes, like a ribbon caught in the binding.
      length = Math.min(MAX_PX, Math.max(0, dy) * 0.55);
      setPull(length);
      if (e.cancelable) e.preventDefault();
    };
    const onEnd = () => {
      if (start && length >= ARMED_PX) pulled();
      start = null;
      length = 0;
      setPull(0);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [pulled]);

  // While fetching after a pull, the ribbon stays down until the page is new.
  const length = pull || (pending ? ARMED_PX : 0);
  const armed = pull >= ARMED_PX || (pending && !pull);
  return (
    <div ref={area} className="relative flex min-h-0 flex-1 flex-col">
      <div
        aria-hidden
        className={`ribbon-pull ${armed ? "bg-accent" : "bg-ink"} ${pull ? "" : "ribbon-pull-settle"} ${pending && !pull ? "ribbon-pull-wait" : ""}`}
        style={{ height: length }}
      />
      <p role="status" className="sr-only">
        {pending ? copy.updating : ""}
      </p>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
