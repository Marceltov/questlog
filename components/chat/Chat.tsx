"use client";
// The in-app chat (ADR 0013): a sheet over the book where the player asks Claude, tells what happened or corrects what is on the page,
// by typing or, with a transcription server, by speaking. It opens from the button at the bottom of every page, or from the button on a
// card, with that card as what the chat is about (a chip the player can remove). The conversation is kept on this device; the server
// gets it whole with every message (backend/chat-route.ts). When Claude filed or changed something, the page fetches again. Modelled on
// freundebuch's ChatSheet.
import { AudioLines, MessageSquareText, Mic, SendHorizontal, SquarePen, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { AboutKind, ChatLink } from "@/backend";
import { useCopy, useLocale } from "../copy/client";
import { ClaudeMark } from "./ClaudeMark";
import { canRecord, useVoice } from "./useVoice";

/** What a card's button hands the chat: the row, its name for the chip, and the playthrough it is in. */
export type About = { kind: AboutKind; id: string; name: string; playthroughId: string };
type Turn = { role: "user" | "assistant"; content: string; links?: ChatLink[]; filed?: boolean };

const ChatContext = createContext<{ enabled: boolean; open: (about?: About) => void }>({ enabled: false, open: () => {} });

// One chat per player on this device. Storage can be blocked or throw (private windows); the chat then lasts while the page is open.
const keyOf = (playerId: string) => `questlog.chat.${playerId}`;
const isTurn = (t: unknown): t is Turn =>
  !!t && typeof t === "object" && ((t as Turn).role === "user" || (t as Turn).role === "assistant") && typeof (t as Turn).content === "string";
function load(playerId: string): Turn[] {
  try {
    const t = JSON.parse(localStorage.getItem(keyOf(playerId)) ?? "[]");
    return Array.isArray(t) ? t.filter(isTurn) : [];
  } catch {
    return [];
  }
}
function save(playerId: string, t: Turn[]) {
  try {
    if (t.length) localStorage.setItem(keyOf(playerId), JSON.stringify(t));
    else localStorage.removeItem(keyOf(playerId));
  } catch {}
}

// What goes to the server with the next message: the last turns, at most 40 and 250 000 characters together (the limits of
// backend/chat-route.ts), starting with one of the player's.
function recentTurns(turns: Turn[]): Turn[] {
  let from = Math.max(0, turns.length - 40);
  let chars = turns.slice(from).reduce((n, t) => n + t.content.length, 0);
  while (from < turns.length - 1 && (chars > 250_000 || turns[from].role !== "user")) chars -= turns[from++].content.length;
  return turns.slice(from);
}

// The playthrough whose page is open, from the address the book keeps in step with the page turned to.
const pageRun = () => window.location.pathname.match(/^\/p\/([^/]+)/)?.[1];

/** The chat for the pages under it: the button at the bottom, and the sheet once it is opened. Nothing when the chat is off. */
export function ChatProvider({ enabled, voice, playerId, children }: { enabled: boolean; voice: boolean; playerId: string; children: ReactNode }) {
  const copy = useCopy();
  const [state, setState] = useState<{ about?: About } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = useCallback((about?: About) => {
    opener.current = document.activeElement as HTMLElement | null;
    setState({ about });
  }, []);
  const close = useCallback(() => {
    setState(null);
    opener.current?.focus();
  }, []);
  return (
    <ChatContext.Provider value={{ enabled, open }}>
      {children}
      {enabled && !state && (
        <button type="button" className="chat-fab" aria-label={copy.askClaude} title={copy.askClaude} onClick={() => open()}>
          <ClaudeMark />
        </button>
      )}
      {enabled && state && <ChatSheet playerId={playerId} voice={voice} about={state.about} onClose={close} />}
    </ChatContext.Provider>
  );
}

/** The button on a card: opens the chat about that card. Nothing when the chat is off. */
export function TalkAbout({ kind, id, name, playthroughId, small = false }: About & { small?: boolean }) {
  const copy = useCopy();
  const { enabled, open } = useContext(ChatContext);
  if (!enabled) return null;
  return (
    <button
      type="button"
      className={small ? "talk-about talk-about-small" : "talk-about"}
      aria-label={copy.talkAbout(name)}
      title={copy.talkAbout(name)}
      onClick={() => open({ kind, id, name, playthroughId })}
    >
      <MessageSquareText aria-hidden="true" />
    </button>
  );
}

const noSubscribe = () => () => {};

function ChatSheet({ playerId, voice, about: opened, onClose }: { playerId: string; voice: boolean; about?: About; onClose: () => void }) {
  const copy = useCopy();
  const language = useLocale();
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>(() => load(playerId));
  const [about, setAbout] = useState(opened);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const errors: Record<string, string> = {
    chat_limit: copy.chatLimit,
    chat_unavailable: copy.chatUnavailable,
    chat_refused: copy.chatRefused,
    chat_too_long: copy.chatTooLong,
  };

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns, busy]);

  // The field is one line to start with and grows with the text.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  // The keyboard starts in the field, and comes back to it once a reply is in.
  useEffect(() => {
    if (!busy) field.current?.focus();
  }, [busy]);

  // Where the browser doesn't shrink the page for the keyboard (Safari on iOS), the sheet follows the visible area itself.
  const [visible, setVisible] = useState<{ top: number; bottom: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const fit = () =>
      setVisible(vv.height < window.innerHeight - 1 ? { top: vv.offsetTop, bottom: Math.max(0, window.innerHeight - vv.height - vv.offsetTop) } : null);
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, []);

  // Escape closes the sheet wherever the focus is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Tab and Shift+Tab go round inside the sheet while it is open; arrow keys stay in it and don't turn the book's pages.
  function keys(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.stopPropagation();
    if (e.key !== "Tab" || !sheet.current) return;
    const all = [...sheet.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), textarea:not([disabled])")];
    if (!all.length) return;
    const [first, last] = [all[0], all[all.length - 1]];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const recording = useVoice(
    (text) => send(text, true),
    (message) => setError(message),
  );
  // Known only in the browser; the server renders no microphone.
  const mic = useSyncExternalStore(
    noSubscribe,
    () => voice && canRecord(),
    () => false,
  );

  /** Sends the field, or `offered` (words spoken in); `spoken` words go into the field when sending fails. */
  async function send(offered?: string, spoken = false) {
    const text = (offered ?? draft).trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    const asked: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(asked);
    if (!offered) setDraft("");
    const playthroughId = about?.playthroughId ?? pageRun();
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        turns: recentTurns(asked).map(({ role, content, filed }) => ({ role, content, filed })),
        context: { playthroughId, about: about ? { kind: about.kind, id: about.id } : undefined, language },
      }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    setBusy(false);
    const failed = !res || !body || "code" in body || !res.ok;
    const message = failed ? (body && errors[body.code]) || copy.chatUnavailable : null;
    // Nothing filed: the message goes back into the field to send again. Filed before the failure: say so, so it isn't sent twice.
    if (failed && !body?.filed) {
      setTurns(turns);
      if (!offered || spoken) setDraft(text);
      return setError(message);
    }
    const next: Turn[] = [...asked, { role: "assistant", content: failed ? copy.filedThenFailed(message!) : body.reply, links: body.links, filed: body.filed }];
    setTurns(next);
    save(playerId, next);
    if (body.filed) router.refresh();
  }

  function reset() {
    setTurns([]);
    save(playerId, []);
    setError(null);
    setAbout(undefined);
  }

  return (
    <div className="chat-overlay" onKeyDown={keys}>
      <div className="chat-backdrop" onClick={onClose} />
      <section
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-label={copy.chatTitle}
        className="chat-sheet"
        style={visible ? { top: visible.top, bottom: visible.bottom, height: "auto" } : undefined}
      >
        <header className="flex items-center gap-2 px-4 pt-4 pb-2">
          <h2 className="flex flex-1 items-center gap-2 text-xl font-bold">
            <ClaudeMark className="h-7 w-7" />
            {copy.chatTitle}
          </h2>
          <button type="button" onClick={reset} className="chat-tool">
            <SquarePen aria-hidden="true" className="h-4 w-4" />
            {copy.newChat}
          </button>
          <button type="button" aria-label={copy.closeChat} title={copy.closeChat} onClick={onClose} className="chat-icon-button">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 py-2">
          {about && (
            <span className="chat-chip">
              {copy.aboutChip(about.name)}
              <button type="button" aria-label={copy.removeContext} title={copy.removeContext} onClick={() => setAbout(undefined)} className="chat-chip-x">
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
          {turns.length === 0 && <p className="mt-6 text-center text-muted">{copy.chatHello}</p>}
          {turns.map((t, i) =>
            t.role === "user" ? (
              <p key={i} className="chat-bubble chat-mine">
                {t.content}
              </p>
            ) : (
              <div key={i} className="flex max-w-[85%] flex-col items-start gap-1.5 self-start">
                <p className="chat-bubble chat-theirs">{t.content}</p>
                {t.links && t.links.length > 0 && (
                  <span className="flex flex-wrap gap-1.5">
                    {t.links.map((l) => (
                      <Link key={l.url} href={l.url} onClick={onClose} className="chat-link">
                        {l.name}
                      </Link>
                    ))}
                  </span>
                )}
              </div>
            ),
          )}
          {recording.state === "transcribing" && (
            <p role="status" className="chat-bubble chat-mine flex items-center gap-2 opacity-80">
              <AudioLines aria-hidden="true" className="h-4 w-4 shrink-0 motion-safe:animate-pulse" />
              <span className="text-sm">{copy.voiceTranscribing}</span>
            </p>
          )}
          {busy && (
            <p role="status" className="chat-bubble chat-theirs flex items-center gap-2">
              <span aria-hidden="true" className="flex gap-1">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="h-2 w-2 rounded-full bg-accent motion-safe:animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </span>
              <span className="text-sm text-muted">{copy.thinking}</span>
            </p>
          )}
          <div ref={end} />
        </div>

        {error && (
          <p role="alert" className="mx-4 rounded-lg border border-error px-3 py-2 text-sm text-error">
            {error}
          </p>
        )}
        <form
          className="chat-form"
          style={{ marginBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {recording.state === "recording" ? (
            <>
              <button type="button" aria-label={copy.voiceCancel} title={copy.voiceCancel} onClick={recording.cancel} className="chat-icon-button -ml-2">
                <Trash2 aria-hidden="true" className="h-5 w-5" />
              </button>
              <p role="status" className="flex min-h-10 flex-1 items-center gap-2 py-2">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-error motion-safe:animate-pulse" />
                <span className="sr-only">{copy.voiceRecording}</span>
                <span className="tabular-nums">{`${Math.floor(recording.seconds / 60)}:${String(recording.seconds % 60).padStart(2, "0")}`}</span>
              </p>
              <button type="button" aria-label={copy.voiceSend} title={copy.voiceSend} onClick={recording.send} className="chat-send">
                <SendHorizontal aria-hidden="true" className="h-5 w-5" />
              </button>
            </>
          ) : (
            <>
              <textarea
                ref={field}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter starts a new line, as on a phone it has to; Ctrl+Enter or ⌘+Enter sends from a keyboard.
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                enterKeyHint="enter"
                aria-label={copy.message}
                placeholder={copy.chatPlaceholder}
                rows={1}
                className="max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2 leading-6 outline-none"
              />
              {mic && !draft.trim() ? (
                <button
                  type="button"
                  aria-label={recording.state === "transcribing" ? copy.voiceTranscribing : copy.voiceRecord}
                  title={recording.state === "transcribing" ? copy.voiceTranscribing : copy.voiceRecord}
                  disabled={busy || recording.state !== "idle"}
                  onClick={() => {
                    setError(null);
                    recording.start();
                  }}
                  className="chat-send"
                >
                  <Mic aria-hidden="true" className={`h-5 w-5 ${recording.state === "transcribing" ? "motion-safe:animate-pulse" : ""}`} />
                </button>
              ) : (
                <button type="submit" aria-label={copy.send} title={copy.send} disabled={busy || !draft.trim()} className="chat-send">
                  <SendHorizontal aria-hidden="true" className="h-5 w-5" />
                </button>
              )}
            </>
          )}
        </form>
      </section>
    </div>
  );
}
