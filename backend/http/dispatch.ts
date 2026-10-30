// Table entries and the dispatcher for /api/v1, as in freundebuch. An entry's handler is typed from the entry's own declared responses, so
// it can't return a status or body shape the API description doesn't list; the dispatcher enforces the same at run time for what types
// can't see (thrown errors, formats).
import * as z from "zod";
import { playerFromApiToken } from "../auth/session";
import { AuthError, NotFoundError } from "../errors";
import { logger } from "../log";
import type { Player } from "../types";
import { absoluteUrls, apiResource } from "../urls";
import { config } from "../config";
import { errorReply, InvalidRequestError } from "./errors";

const log = logger("http");

/** The largest JSON body the API reads: a transcript is at most 200,000 characters, which is under 1 MiB even as UTF-8. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

// A response without a schema has no body (a 204).
export type ResponseSpec = { description: string; schema?: z.ZodType };

type BodyOf<R> = R extends { schema: infer S extends z.ZodType } ? z.input<S> : undefined;
export type Reply<R> = {
  [S in keyof R & number]: { status: S; body: BodyOf<R[S]> };
}[keyof R & number];

type QueryOf<Q> = Q extends z.ZodObject ? z.infer<Q> : Record<string, never>;
type JsonOf<B> = B extends z.ZodType ? z.infer<B> : undefined;

type Meta<R, Q, B> = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** The OpenAPI template including /api/v1, e.g. "/api/v1/playthroughs/{id}". */
  path: string;
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  params: Record<string, z.ZodType>;
  query?: Q;
  /** A JSON object, read and checked before the handler runs. */
  body?: B;
  responses: R;
};
export type Handler<R, Q, B> = (input: {
  player: Player;
  req: Request;
  params: Record<string, string>;
  query: QueryOf<Q>;
  body: JsonOf<B>;
}) => Promise<Reply<R>>;
export type Op<
  R extends Record<number, ResponseSpec> = Record<number, ResponseSpec>,
  Q extends z.ZodObject | undefined = z.ZodObject | undefined,
  B extends z.ZodType | undefined = z.ZodType | undefined,
> = Meta<R, Q, B> & { handle: Handler<R, Q, B> };

type AnyReply = { status: number; body?: unknown };
// Any entry, as the dispatcher sees it: the per-entry typing is checked where the entry is declared.
export type AnyOp = Meta<Record<number, ResponseSpec>, z.ZodObject | undefined, z.ZodType | undefined> & { handle: (input: never) => Promise<AnyReply> };

// Declares an entry: op({...}).handle(async (input) => reply). Two calls on purpose: the first fixes the declared responses, so the
// handler's replies are checked against them with literal statuses (in one call, TypeScript widens `status: 200` to number first).
export function op<const R extends Record<number, ResponseSpec>, Q extends z.ZodObject | undefined = undefined, B extends z.ZodType | undefined = undefined>(
  meta: Meta<R, Q, B>,
): { handle: (h: Handler<R, Q, B>) => Op<R, Q, B> } {
  return { handle: (handle) => ({ ...meta, handle }) };
}

// The entries for a path, whatever the method, with its path parameters. `segments` are the decoded path after `prefix` (Next's
// catch-all param), so "a%2Fb" is one segment "a/b".
export function matchOps(ops: AnyOp[], prefix: string, segments: string[]): { ops: AnyOp[]; params: Record<string, string> } | null {
  const found: AnyOp[] = [];
  let params: Record<string, string> = {};
  for (const o of ops) {
    if (!o.path.startsWith(prefix + "/")) continue;
    const tpl = o.path.slice(prefix.length + 1).split("/");
    if (tpl.length !== segments.length) continue;
    const p: Record<string, string> = {};
    if (tpl.every((t, i) => (t.startsWith("{") ? ((p[t.slice(1, -1)] = segments[i]), true) : t === segments[i]))) {
      found.push(o);
      params = p;
    }
  }
  return found.length ? { ops: found, params } : null;
}

// Empty values count as absent; of repeated keys, the last wins.
function queryOf(req: Request): Record<string, string> {
  return Object.fromEntries([...new URL(req.url).searchParams].filter(([, v]) => v !== ""));
}

const complaint = (error: z.ZodError) => z.prettifyError(error).replace(/\s+/g, " ").replace(/^✖ /, "");

// Reads at most `max` bytes; null as soon as the body is larger, or when it ends before the Content-Length it declared.
async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  const declared = req.headers.get("content-length");
  if (Number(declared) > max) return null;
  if (!req.body) return declared !== null && Number(declared) > 0 ? null : new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  if (declared !== null && size < Number(declared)) return null;
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

async function jsonBody(req: Request, schema: z.ZodType): Promise<unknown> {
  const bytes = await readCapped(req, MAX_BODY_BYTES);
  if (!bytes) throw new InvalidRequestError("The request body is too large or was cut short");
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new InvalidRequestError("The request body must be JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new InvalidRequestError(complaint(parsed.error));
  return parsed.data;
}

// The challenge a refused token gets (RFC 6750, RFC 9728): where to find out how to get a token for this API.
const challenge = () => `Bearer resource_metadata="${config.publicUrl()}/.well-known/oauth-protected-resource${new URL(apiResource()).pathname}"`;

function send(entry: AnyOp, reply: AnyReply): Response {
  const declared = (entry.responses as Record<number, ResponseSpec>)[reply.status];
  if (!declared) {
    log.error({ operation: entry.operationId, status: reply.status }, "an operation answered a status it doesn't declare");
    return Response.json({ error: "internal error", code: "internal" }, { status: 500 });
  }
  // The body goes out as its schema declares it: fields it doesn't name are dropped, as on /mcp. Types can't see formats and patterns
  // (or a thrown error's body): a mismatch fails loudly in development and as a bare 500 in production.
  let body = reply.body;
  if (declared.schema) {
    const checked = declared.schema.safeParse(reply.body);
    if (!checked.success) {
      if (process.env.NODE_ENV !== "production")
        throw new Error(`${entry.operationId} answered ${reply.status} with a body that doesn't match its schema: ${z.prettifyError(checked.error)}`, {
          cause: checked.error,
        });
      log.error({ operation: entry.operationId, status: reply.status }, "an operation answered a body its schema doesn't allow");
      return Response.json({ error: "internal error", code: "internal" }, { status: 500 });
    }
    body = checked.data;
  }
  const headers = reply.status === 401 ? { "www-authenticate": challenge() } : undefined;
  if (body === undefined) return new Response(null, { status: reply.status, headers });
  return Response.json(absoluteUrls(config.publicUrl(), body), { status: reply.status, headers });
}

// `prefix` is where the catch-all route is mounted ("/api/v1"); entry paths include it.
export function createDispatcher(ops: AnyOp[], prefix: string): (req: Request, segments: string[]) => Promise<Response> {
  return async (req, segments) => {
    const m = matchOps(ops, prefix, segments);
    if (!m) return Response.json(errorReply(new NotFoundError("no such endpoint")).body, { status: 404 });
    // Next answers HEAD by calling the GET export with the request as is; it drops the body itself.
    const method = req.method === "HEAD" ? "GET" : req.method;
    const entry = m.ops.find((o) => o.method === method);
    if (!entry) {
      const methods = m.ops.map((o) => o.method);
      const allow = (methods.includes("GET") ? [...methods, "HEAD"] : methods).sort().join(", ");
      return Response.json({ error: "method not allowed" }, { status: 405, headers: { Allow: allow } });
    }
    let reply: AnyReply;
    try {
      // Who is asking comes first: a stranger learns nothing, not even that their parameters are wrong.
      const player = await playerFromApiToken(req);
      if (!player) throw new AuthError();
      let query: Record<string, unknown> = {};
      if (entry.query) {
        const parsed = entry.query.safeParse(queryOf(req));
        if (!parsed.success) throw new InvalidRequestError(complaint(parsed.error));
        query = parsed.data;
      }
      const body = entry.body ? await jsonBody(req, entry.body) : undefined;
      reply = await entry.handle({ player, req, params: m.params, query, body } as never);
    } catch (e) {
      reply = errorReply(e);
      if (reply.status === 500) return Response.json(reply.body, { status: 500 }); // never declared, always allowed
    }
    return send(entry, reply);
  };
}
