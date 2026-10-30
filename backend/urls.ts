// URLs the backend hands out. The domain hands out paths; mcp.ts makes them absolute with absoluteUrls() just before a result
// leaves, so the pages, which read the domain in-process, get links they can use as they are.
import { config } from "./config";

/** A playthrough: its briefing, open quests, build and items. */
export const playthroughPath = (id: string) => `/p/${id}`;
/** A play session: its transcript and what was filed from it. */
export const sessionPath = (id: string) => `/s/${id}`;
/** A quest's row on its playthrough's page. */
export const questPath = (playthroughId: string, id: string) => `${playthroughPath(playthroughId)}#quest-${id}`;
/** An item's row on its playthrough's page. */
export const itemPath = (playthroughId: string, id: string) => `${playthroughPath(playthroughId)}#item-${id}`;

/** A copy of `body` with every `url` that is a path prefixed with `base`. */
export function absoluteUrls<T>(base: string, body: T): T {
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (x === null || typeof x !== "object") return x;
    return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, k === "url" && typeof val === "string" && val.startsWith("/") ? base + val : walk(val)]));
  };
  return walk(body) as T;
}

// Better Auth lives under this path; its issuer is the public URL plus it.
export const AUTH_PATH = "/api/auth";
/** The OAuth resource (RFC 8707) MCP access tokens are bound to. */
export const mcpResource = () => `${config.publicUrl()}/mcp`;
/** Where the REST API lives; its paths in the route table start with it. */
export const API_PREFIX = "/api/v1";
/** The OAuth resource REST access tokens are bound to: a token for /mcp fails there, and the other way round. */
export const apiResource = () => `${config.publicUrl()}${API_PREFIX}`;
/** The issuer of the access tokens: Better Auth, under its base path. */
export const issuer = () => `${config.publicUrl()}${AUTH_PATH}`;
// The keys tokens are checked against. Fetched from this same process over loopback, not through PUBLIC_URL: a server behind a reverse
// proxy often can't reach its own public address.
export const jwksUrl = () => `http://127.0.0.1:${config.port()}${AUTH_PATH}/jwks`;

// Where to go after signing in: a same-origin path, else "/". A second "/" or any "\" would make it protocol-relative (browsers read
// "\" as "/"), and browsers drop tabs and newlines, so "/\t/x" is "//x".
export const safeNext = (v: unknown): string => (typeof v === "string" && /^\/(?![/\\])[^\\\x00-\x1f\x7f]*$/.test(v) ? v : "/");
