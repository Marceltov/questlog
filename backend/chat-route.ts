// POST /api/chat and POST /api/chat/voice: the in-app chat (ADR 0013), for the web app only. The signed-in browser's session cookie;
// an access token is refused, so scripts and Claude keep REST and MCP. Not in the REST table or OpenAPI. Without an API key there is no
// chat: 404, and the app shows no button; without a transcription server, no microphone.
import * as z from "zod";
import { playerFromHeaders } from "./auth/session";
import type { Player } from "./types";
import { ABOUT_KINDS, anthropicModel, chat, MAX_TURNS, type ChatModel } from "./chat";
import { config } from "./config";
import { NotFoundError } from "./errors";
import { processState } from "./state";
import { transcriber } from "./transcribe";

const MAX_CHARS = 200_000;
// All turns of one message together: a long session fits, a runaway history doesn't (each tool round resends it).
export const MAX_TOTAL_CHARS = 250_000;
const Body = z.object({
  turns: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(MAX_CHARS), filed: z.boolean().optional() }))
    .min(1)
    .max(MAX_TURNS)
    .refine((t) => t[t.length - 1].role === "user", "the last turn must be the player's")
    .refine((t) => t.reduce((n, x) => n + x.content.length, 0) <= MAX_TOTAL_CHARS, `at most ${MAX_TOTAL_CHARS} characters in all`),
  context: z
    .object({
      playthroughId: z.string().max(100).optional(),
      about: z.object({ kind: z.enum(ABOUT_KINDS), id: z.string().max(100) }).optional(),
      language: z.enum(["en", "de"]).optional(),
    })
    .optional(),
});

const state = processState("chat", () => ({ override: null as ChatModel | null }));
/** Tests stand in for Claude here; null goes back to the configured model. */
export const setChatModelForTests = (m: ChatModel | null) => {
  state.override = m;
};

function model(): ChatModel | null {
  if (state.override) return state.override;
  const key = config.anthropicKey();
  return key ? anthropicModel(key) : null;
}

/** Whether the app offers the chat: an API key is set. */
export const chatEnabled = (): boolean => !!state.override || !!config.anthropicKey();
/** Whether the chat offers speaking a message: the chat is on and a transcription server is set up. */
export const voiceEnabled = (): boolean => chatEnabled() && !!transcriber();

const STATUS = { chat_limit: 429, chat_unavailable: 502, chat_refused: 200, chat_too_long: 200 } as const;
const json = (body: unknown, status = 200) => Response.json(body, { status });

// The body, or null when it is longer than `max` bytes: read in chunks, so a lying or missing Content-Length can't make it bigger.
async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return null;
  if (!req.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of req.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > max) return null;
    chunks.push(chunk);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

// Who may call either route: the signed-in browser, never a bearer token.
async function caller(req: Request): Promise<{ p: Player } | { error: Response }> {
  if (req.headers.has("authorization")) return { error: json({ error: "the chat is for the web app", code: "unauthorized" }, 401) };
  const p = await playerFromHeaders(req.headers);
  return p ? { p } : { error: json({ error: "sign-in required", code: "unauthorized" }, 401) };
}

export async function chatRoute(req: Request): Promise<Response> {
  const m = model();
  if (!m) return json({ error: "not found", code: "not_found" }, 404);
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const who = await caller(req);
  if ("error" in who) return who.error;
  const bytes = await readCapped(req, 4 * MAX_TOTAL_CHARS);
  if (!bytes) return json({ error: "The conversation is too long", code: "invalid_request" }, 413);
  let parsed: z.infer<typeof Body>;
  try {
    const r = Body.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    if (!r.success) return json({ error: z.prettifyError(r.error), code: "invalid_request" }, 400);
    parsed = r.data;
  } catch {
    return json({ error: "The request body must be JSON", code: "invalid_request" }, 400);
  }
  try {
    const reply = await chat(who.p, parsed.turns, parsed.context ?? {}, m);
    return "code" in reply ? json(reply, STATUS[reply.code]) : json(reply);
  } catch (e) {
    if (e instanceof NotFoundError) return json({ error: e.message, code: "not_found" }, 404);
    throw e;
  }
}

/** The longest spoken message taken: a few minutes of Opus or AAC from the browser is well under this. */
const MAX_VOICE = 15 * 1024 * 1024;

// A message spoken into the chat (the body, as the browser recorded it), turned into its words by the instance's own Whisper and handed
// back, for the app to send as the player's message. The recording is never stored.
export async function voiceRoute(req: Request): Promise<Response> {
  const t = model() ? transcriber() : null;
  if (!t) return json({ error: "not found", code: "not_found" }, 404);
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const who = await caller(req);
  if ("error" in who) return who.error;
  const bytes = await readCapped(req, MAX_VOICE);
  if (!bytes) return json({ error: "The recording is too long", code: "voice_too_long" }, 413);
  if (!bytes.byteLength) return json({ error: "The recording is empty", code: "voice_empty" }, 400);
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith("audio/")) return json({ error: "Send the recording as audio/*", code: "invalid_request" }, 400);
  const heard = await t.transcribe(bytes, type);
  if ("error" in heard) return json({ error: heard.error, code: "voice_unavailable" }, 502);
  return json({ text: heard.text });
}
