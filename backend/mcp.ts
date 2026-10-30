// The MCP endpoint: POST /mcp, protocol 2026-07-28 only, the tools of tools.ts. Every call carries the player's own access token, checked
// by @better-auth/mcp (signature, issuer, audience /mcp, expiry), and every tool acts as that player: what they see is decided in the
// domain (spoilers.ts), never by Claude.
import { requireMcpAuth } from "@better-auth/mcp";
import { McpServer, createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import type * as z from "zod";
import { auth } from "./auth/auth";
import { playerById } from "./auth/session";
import { config } from "./config";
import { QuestlogError } from "./errors";
import { logger } from "./log";
import { TOOLS } from "./tools";
import type { Player } from "./types";
import { absoluteUrls, jwksUrl, mcpResource } from "./urls";

const log = logger("mcp");

export const INSTRUCTIONS = `questlog keeps track of where the player is in the games they play: the quests they started, their build and the items they found. They tell you while they play; you file it with record, one play session at a time, their words verbatim as the transcript. When they pick a game up again ("where was I?"), give them the briefing; for "what is still open?", open_threads; for an item they have, or whether a new one fits their build, item. When they say something filed is wrong, fix it with correct.
No spoilers: say only what questlog returns. Never add quest steps, places, bosses, items or outcomes from your own knowledge of the game, and never hint at what the player hasn't found, unless they ask for a hint; then ask open_threads with reveal, and warn before you read it out. "Did I miss anything?" is missed: warn first that the answer may give things away, and ask whether they want hints or full spoilers.
File only what the player said happened, and ask when you aren't sure: which quest they mean, whether they finished something or only started it, which choice they made. A screenshot they share reaches you but no tool: write what it shows (stats, an item's numbers) into the transcript and the fields of record.
Keep the game's own names: a German stat or quest name goes into localName next to the English one.
Every tool result carries next: what to do now, worked out from what the call did. Follow it before you answer. Every playthrough, session, quest and item comes with a url in the web app; give the player the link when they may want to look.`;

// A tool result: the body as structured content and, for clients that only read text, as JSON text. The body goes through the tool's
// output schema first, which drops every field the schema doesn't name. Its links are made absolute against the public URL.
function result<S extends z.ZodType>(schema: S, body: unknown) {
  const out = absoluteUrls(config.publicUrl(), schema.parse(body)) as Record<string, unknown>;
  return { structuredContent: out, content: [{ type: "text" as const, text: JSON.stringify(out) }] };
}

// QuestlogErrors are refusals the model can read. Any other throw would carry its message to the client (a database error could name a
// table or a value), so it is logged here and the client gets "internal error".
function guard<A, R>(f: (args: A) => Promise<R>) {
  return async (args: A) => {
    try {
      return await f(args);
    } catch (e) {
      if (e instanceof QuestlogError) return { isError: true as const, content: [{ type: "text" as const, text: e.message }] };
      log.error({ err: e }, "tool failed");
      return { isError: true as const, content: [{ type: "text" as const, text: "internal error" }] };
    }
  };
}

export function server(p: Player): McpServer {
  const s = new McpServer({ name: "questlog", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  for (const t of TOOLS)
    s.registerTool(
      t.name,
      { description: t.description, inputSchema: t.input, outputSchema: t.output, annotations: t.annotations },
      guard(async (args: unknown) => result(t.output, await t.run(p, args))) as never,
    );
  return s;
}

// A session's transcript holds at most 200,000 characters.
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;

// "auto" answers with one JSON body unless a tool emits mid-call notifications, which ours never do. The gate below has found the player
// already; it arrives here in authInfo.
const handler = createMcpHandler(({ authInfo }) => server(authInfo!.extra!.player as Player), { legacy: "reject", maxRequestBodySize: MAX_REQUEST_BYTES });

/** Answers one MCP request as `player`; the caller has checked who that is. */
export const mcpAs = (req: Request, player: Player): Promise<Response> =>
  handler.fetch(req, { authInfo: { token: "", clientId: "oauth", scopes: [], extra: { player } } satisfies AuthInfo });

const rpcError = (status: number, message: string, headers?: Record<string, string>) =>
  Response.json({ jsonrpc: "2.0", error: { code: -32600, message } }, { status, headers });

export async function mcpRoute(req: Request): Promise<Response> {
  // The SDK doesn't check Origin, so a page of another site can't drive this endpoint: no Origin (server-side clients) passes, a present
  // one must be our own.
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== new URL(config.publicUrl()).origin) return rpcError(403, "forbidden origin");
  const a = await auth();
  return requireMcpAuth(
    a,
    async (r, claims) => {
      const player = typeof claims.sub === "string" ? await playerById(claims.sub) : null;
      // A token for a player who has been deleted since: the client has to sign in again.
      if (!player)
        return rpcError(401, "invalid token", {
          "www-authenticate": `Bearer error="invalid_token", resource_metadata="${config.publicUrl()}/.well-known/oauth-protected-resource/mcp"`,
        });
      return mcpAs(r, player);
    },
    { resource: mcpResource(), jwksUrl: jwksUrl() },
  )(req);
}
