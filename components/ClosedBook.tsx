"use client";
// The sign-in page: a closed almanac on a desk, the sign-in on a label on its cover. Once the player is in, the cover swings open on its
// spine, the desk fades, and the open almanac behind every page (app/globals.css) is what is left; then the app loads. With reduced motion
// the book just goes.
import { useState } from "react";
import { copy } from "./copy";
import { LoginForm } from "./LoginForm";

type Methods = { emailCode: boolean; providers: { id: string; label: string }[] };

/** How long the opening takes, in ms; keep in step with the transitions of .book in app/globals.css. */
const OPENING_MS = 1900;

export function ClosedBook({ methods, next }: { methods: Methods; next: string }) {
  const [open, setOpen] = useState(false);
  const [keeper, setKeeper] = useState("");

  async function opening(email: string) {
    setKeeper(email);
    setOpen(true);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    await new Promise((r) => setTimeout(r, OPENING_MS));
  }

  return (
    <div className={`desk ${open ? "desk-open" : ""}`}>
      <div className={`book ${open ? "book-open" : ""}`}>
        {/* The title page under the cover, seen as it opens. */}
        <div className="book-pages" aria-hidden="true">
          <svg viewBox="0 0 64 64" className="mb-3 h-12 w-12" aria-hidden="true">
            <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M32 6 L36 28 L58 32 L36 36 L32 58 L28 36 L6 32 L28 28 Z" fill="currentColor" opacity="0.7" />
          </svg>
          <p className="text-2xl font-bold tracking-[0.2em] uppercase">{copy.appName}</p>
          {keeper && <p className="mt-6 text-sm italic">{copy.keptBy(keeper)}</p>}
        </div>
        <div className="book-flap">
          <div className="book-endpaper" aria-hidden="true" />
          <div className="book-cover">
            <div className="book-title">
              <svg viewBox="0 0 64 64" className="mx-auto mb-2 h-10 w-10" aria-hidden="true">
                <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M32 6 L36 28 L58 32 L36 36 L32 58 L28 36 L6 32 L28 28 Z" fill="currentColor" />
              </svg>
              <h1 className="text-3xl font-bold tracking-[0.25em] uppercase">{copy.appName}</h1>
              <p className="mt-1 text-xs tracking-[0.2em] uppercase opacity-80">{copy.almanac}</p>
            </div>
            <div className="book-label">
              <h2 className="text-lg font-bold">{copy.signInTitle}</h2>
              <p className="mt-1 mb-5 text-sm text-muted">{copy.signInLead}</p>
              <LoginForm methods={methods} next={next} onSignedIn={opening} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
