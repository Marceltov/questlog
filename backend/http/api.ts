// The REST API, /api/v1, defined in code: this table is the single source. `dispatch` serves requests through it, and openApiDocument()
// generates the OpenAPI 3.1 description (openapi.json, `npm run generate`). Every entry calls the same domain functions as the MCP tools,
// as the player the access token names, through the same gate (spoilers.ts); what the tools add for Claude (`next`) stays out (values V5).
import * as z from "zod";
import { briefing } from "../briefing";
import { buildOf } from "../builds";
import { codexOf } from "../codex";
import { correct } from "../correct";
import { getPlaythrough, listPlaythroughs } from "../games";
import { itemsOf } from "../items";
import { missed } from "../missed";
import { questsOf } from "../quests";
import { record } from "../record";
import { tagsInPlaythrough } from "../tags-in-use";
import { ChangeInput, RecordInput, Spoiler } from "../schemas";
import { getSession, sessionsOf } from "../sessions";
import { CODEX_KINDS, QUEST_STATUSES } from "../types";
import { API_PREFIX, apiResource } from "../urls";
import { createDispatcher, op, type AnyOp, type ResponseSpec } from "./dispatch";
import {
  BriefingJson,
  BuildJson,
  CodexListJson,
  TagListJson,
  COMPONENTS,
  CorrectedJson,
  ErrorJson,
  ItemListJson,
  MissedJson,
  PlaythroughJson,
  PlaythroughListJson,
  QuestListJson,
  RecordedJson,
  SessionJson,
  SessionListJson,
} from "./schemas";

const err = (description: string) => ({ description, schema: ErrorJson }) satisfies ResponseSpec;
const E400 = err("The request can't be read (`invalid_request`), or a value in it is not acceptable (`invalid_input`)");
const E401 = err("No valid access token for this API (`unauthorized`); `WWW-Authenticate` points to how to get one");
const E404 = err("No such thing, or one of another player's (`not_found`)");
const E409 = err("The request could mean more than one thing: two playthroughs being played, a name another row has (`ambiguous`)");

const Id = z.string().describe("The id");
const RevealQuery = Spoiler.optional().describe("Default none: only what the player found. hint or full only when the player asked for spoilers");

const OPS: AnyOp[] = [
  op({
    method: "GET",
    path: `${API_PREFIX}/playthroughs`,
    operationId: "listPlaythroughs",
    summary: "The player's playthroughs",
    tags: ["Playthroughs"],
    params: {},
    responses: { 200: { description: "Most recently played first", schema: PlaythroughListJson }, 401: E401 },
  }).handle(async ({ player }) => ({ status: 200, body: { playthroughs: await listPlaythroughs(player) } })),
  op({
    method: "GET",
    path: `${API_PREFIX}/playthroughs/{id}`,
    operationId: "getPlaythrough",
    summary: "One playthrough",
    tags: ["Playthroughs"],
    params: { id: Id },
    responses: { 200: { description: "The playthrough", schema: PlaythroughJson }, 401: E401, 404: E404 },
  }).handle(async ({ player, params }) => ({ status: 200, body: await getPlaythrough(player, params.id) })),
  op({
    method: "GET",
    path: `${API_PREFIX}/playthroughs/{id}/briefing`,
    operationId: "getBriefing",
    summary: "Where the player was",
    description: "The last session, the open quests with their next steps, the build and what is equipped. It never contains a spoiler.",
    tags: ["Playthroughs"],
    params: { id: Id },
    responses: { 200: { description: "The briefing", schema: BriefingJson }, 401: E401, 404: E404 },
  }).handle(async ({ player, params }) => ({ status: 200, body: await briefing(player, { playthroughId: params.id }) })),
  op({
    method: "GET",
    path: `${API_PREFIX}/playthroughs/{id}/quests`,
    operationId: "listQuests",
    summary: "A playthrough's quests, with their logs",
    tags: ["Playthroughs"],
    params: { id: Id },
    query: z.object({
      status: z
        .string()
        .regex(new RegExp(`^(${QUEST_STATUSES.join("|")})(,(${QUEST_STATUSES.join("|")}))*$`), `statuses, comma-separated: ${QUEST_STATUSES.join(", ")}`)
        .optional()
        .describe(`Only quests with one of these statuses, comma-separated (${QUEST_STATUSES.join(", ")}). Default: all`),
      reveal: RevealQuery,
    }),
    responses: { 200: { description: "Most recently changed first", schema: QuestListJson }, 400: E400, 401: E401, 404: E404 },
  }).handle(async ({ player, params, query }) => {
    const statuses = query.status?.split(",") as (typeof QUEST_STATUSES)[number][] | undefined;
    return { status: 200, body: { quests: await questsOf(player, params.id, { statuses, reveal: query.reveal }) } };
  }),
  op({
    method: "GET",
    path: `${API_PREFIX}/playthroughs/{id}/items`,
    operationId: "listItems",
    summary: "A playthrough's items",
    tags: ["Playthroughs"],
    params: { id: Id },
    query: z.object({
      name: z.string().optional().describe("Only items whose name, or name in the game's language, contains it"),
      equipped: z.enum(["true"]).optional().describe("Only what is equipped"),
      tag: z.string().optional().describe("Only items that carry this tag"),
      reveal: RevealQuery,
    }),
    responses: { 200: { description: "Equipped first, then the newest", schema: ItemListJson }, 400: E400, 401: E401, 404: E404 },
  }).handle(async ({ player, params, query }) => ({
    status: 200,
    body: { items: await itemsOf(player, params.id, { name: query.name, tag: query.tag, equippedOnly: query.equipped === "true", reveal: query.reveal }) },
  })),
  op({
    method: "GET",
    path: `${API_PREFIX}/playthroughs/{id}/codex`,
    operationId: "listCodex",
    summary: "A playthrough's codex: bosses, enemies, NPCs and places",
    description: "With weaknesses, resistances, the strategy and the player's items that are good against each. The same as the MCP tool codex.",
    tags: ["Playthroughs"],
    params: { id: Id },
    query: z.object({
      kind: z.enum(CODEX_KINDS).optional().describe("Only bosses, enemies, NPCs or places"),
      name: z.string().optional().describe("Only entries whose name, or name in the game's language, contains it"),
      tag: z.string().optional().describe("Only entries that carry this tag"),
      reveal: RevealQuery,
    }),
    responses: { 200: { description: "Bosses first, what is still in the way first", schema: CodexListJson }, 400: E400, 401: E401, 404: E404 },
  }).handle(async ({ player, params, query }) => ({
    status: 200,
    body: { entries: await codexOf(player, params.id, { kind: query.kind, name: query.name, tag: query.tag, reveal: query.reveal }) },
  })),
  op({
    method: "GET",
    path: `${API_PREFIX}/playthroughs/{id}/tags`,
    operationId: "listTags",
    summary: "The tags in use in a playthrough",
    description: "Free tags across the groups (ADR 0014), with how many of what the player found carry each; filter items and codex entries by one with ?tag=.",
    tags: ["Playthroughs"],
    params: { id: Id },
    responses: { 200: { description: "Most used first", schema: TagListJson }, 401: E401, 404: E404 },
  }).handle(async ({ player, params }) => ({ status: 200, body: { tags: await tagsInPlaythrough(player, params.id) } })),
  op({
    method: "GET",
    path: `${API_PREFIX}/playthroughs/{id}/build`,
    operationId: "getBuild",
    summary: "A playthrough's build plan and stat snapshots",
    tags: ["Playthroughs"],
    params: { id: Id },
    responses: { 200: { description: "The build", schema: BuildJson }, 401: E401, 404: E404 },
  }).handle(async ({ player, params }) => ({ status: 200, body: await buildOf(player, params.id) })),
  op({
    method: "GET",
    path: `${API_PREFIX}/playthroughs/{id}/sessions`,
    operationId: "listSessions",
    summary: "A playthrough's sessions",
    tags: ["Sessions"],
    params: { id: Id },
    responses: { 200: { description: "Newest first", schema: SessionListJson }, 401: E401, 404: E404 },
  }).handle(async ({ player, params }) => ({ status: 200, body: { sessions: await sessionsOf(player, params.id) } })),
  op({
    method: "GET",
    path: `${API_PREFIX}/playthroughs/{id}/missed`,
    operationId: "getMissed",
    summary: "What the player may have missed",
    description:
      "Only when the player asked, at the level they agreed to: open quests untouched in the last three sessions, and the hints and spoilers filed for open quests. `reveal` is required.",
    tags: ["Playthroughs"],
    params: { id: Id },
    query: z.object({ reveal: z.enum(["hint", "full"]).describe("hint (places and people, no outcomes) or full (everything)") }),
    responses: { 200: { description: "What may have been missed", schema: MissedJson }, 400: E400, 401: E401, 404: E404 },
  }).handle(async ({ player, params, query }) => ({ status: 200, body: await missed(player, { playthroughId: params.id }, query.reveal) })),
  op({
    method: "GET",
    path: `${API_PREFIX}/sessions/{id}`,
    operationId: "getSession",
    summary: "One session, with its transcript",
    tags: ["Sessions"],
    params: { id: Id },
    responses: { 200: { description: "The session", schema: SessionJson }, 401: E401, 404: E404 },
  }).handle(async ({ player, params }) => ({ status: 200, body: await getSession(player, params.id) })),
  op({
    method: "POST",
    path: `${API_PREFIX}/sessions`,
    operationId: "recordSession",
    summary: "File a play session",
    description:
      "The player's words verbatim as transcript, then what was learned from it: quests with their entries, a stat snapshot, the build plan and items. The same as the MCP tool record.",
    tags: ["Sessions"],
    params: {},
    body: RecordInput,
    responses: { 201: { description: "What was filed", schema: RecordedJson }, 400: E400, 401: E401, 404: E404, 409: E409 },
  }).handle(async ({ player, body }) => ({ status: 201, body: await record(player, body) })),
  op({
    method: "POST",
    path: `${API_PREFIX}/corrections`,
    operationId: "correct",
    summary: "Fix or remove what was filed",
    description: "Each change names one row by what and id and sets some of its fields, or removes it; all apply or none. The same as the MCP tool correct.",
    tags: ["Corrections"],
    params: {},
    body: z.object({ changes: z.array(ChangeInput).min(1).max(50) }),
    responses: { 200: { description: "What changed", schema: CorrectedJson }, 400: E400, 401: E401, 404: E404, 409: E409 },
  }).handle(async ({ player, body }) => ({ status: 200, body: { changes: await correct(player, body.changes) } })),
  op({
    method: "GET",
    path: `${API_PREFIX}/openapi.json`,
    operationId: "getOpenApi",
    summary: "This description",
    tags: ["Meta"],
    params: {},
    responses: { 200: { description: "The OpenAPI 3.1 description of the API", schema: z.record(z.string(), z.unknown()) }, 401: E401 },
  }).handle(async () => ({ status: 200, body: openApiDocument(apiResource()) })),
];

/** Answers one /api/v1 request; the segments are the path after /api/v1. */
export const dispatch = createDispatcher(OPS, API_PREFIX);

// ---- The OpenAPI document -------------------------------------------------------------------------------------------------------

type Json = Record<string, unknown>;
const URI = (id: string) => `#/components/schemas/${id}`;

// A schema as OpenAPI wants it: a $ref for a component, else inline JSON Schema.
function jsonSchema(schema: z.ZodType, io: "input" | "output" = "output"): Json {
  const id = (z.globalRegistry.get(schema) as { id?: string } | undefined)?.id;
  if (id) return { $ref: URI(id) };
  const json = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as Json;
  delete json.$schema;
  return json;
}

/** The OpenAPI 3.1 description of the API, with `serverUrl` as its server. */
export function openApiDocument(serverUrl: string): Json {
  const registry = z.registry<{ id: string }>();
  for (const c of COMPONENTS) registry.add(c, { id: (z.globalRegistry.get(c) as { id: string }).id });
  const { schemas } = z.toJSONSchema(registry, { uri: URI, io: "output" }) as { schemas: Record<string, Json> };
  for (const s of Object.values(schemas)) {
    delete s.$schema;
    delete s.$id;
  }
  const paths: Record<string, Json> = {};
  for (const entry of OPS) {
    const parameters = [
      ...Object.entries(entry.params).map(([name, s]) => {
        const { description, ...schema } = jsonSchema(s);
        return { name, in: "path", required: true, description, schema };
      }),
      ...Object.entries(entry.query?.shape ?? {}).map(([name, s]) => {
        const field = s as z.ZodType;
        const { description, ...schema } = jsonSchema(field, "input");
        return { name, in: "query", required: !field.safeParse(undefined).success, description, schema };
      }),
    ];
    const responses = Object.fromEntries(
      Object.entries(entry.responses as Record<number, ResponseSpec>).map(([status, r]) => [
        status,
        { description: r.description, ...(r.schema && { content: { "application/json": { schema: jsonSchema(r.schema) } } }) },
      ]),
    );
    const path = entry.path.slice(API_PREFIX.length);
    paths[path] = {
      ...paths[path],
      [entry.method.toLowerCase()]: {
        operationId: entry.operationId,
        summary: entry.summary,
        ...(entry.description && { description: entry.description }),
        tags: entry.tags,
        security: [{ bearer: [] }],
        ...(parameters.length && { parameters }),
        ...(entry.body && { requestBody: { required: true, content: { "application/json": { schema: jsonSchema(entry.body, "input") } } } }),
        responses,
      },
    };
  }
  return {
    openapi: "3.1.1",
    info: {
      title: "Gamepanion API",
      version: "1",
      description:
        "A spoiler-free quest log, build tracker and item list for the games you play. The MCP endpoint (/mcp) comes first; this API follows it, over the same data and the same rules: only the signed-in player's own log, and no spoiler unless a request asks for it.\n\n" +
        'Every error is JSON, `{"error": "...", "code": "..."}`. Besides the responses listed per operation, an unknown path answers 404 (`not_found`), a method an operation doesn\'t have answers 405 with `Allow`, and a failure on the server\'s side answers 500 (`internal`) without details.',
      license: { name: "AGPL-3.0-only", identifier: "AGPL-3.0-only" },
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: "Playthroughs", description: "The player's runs of their games: briefing, quests, items, build, and what may have been missed." },
      { name: "Sessions", description: "Filing a play session, and reading one back with its transcript." },
      { name: "Corrections", description: "Fixing or removing what was filed." },
      { name: "Meta", description: "About the API itself." },
    ],
    paths,
    components: {
      schemas,
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          description:
            "An OAuth access token from this instance's authorization server, issued for this API's URL (`resource=<PUBLIC_URL>/api/v1`). A token for /mcp is refused here.",
        },
      },
    },
  };
}
