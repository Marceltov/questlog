// The backend's boundary: the only module the frontend (app/, components/, proxy.ts) may import from backend/ (enforced in
// eslint.config.mjs). Each read below is shaped like the endpoint it would become if the backend moved out, so the cut would be here.
import { sql } from "kysely";
import { db } from "./db";
import { healthRoute, setDbProbe } from "./http/health";

export { healthRoute };
export {
  authRoute,
  authServerMetadataRoute,
  clientName,
  openIdConfigRoute,
  passkeysOf,
  playerFromHeaders,
  refusedSignIn,
  signedInAs,
  signInMethods,
  type PasskeyView,
  type RefusedSignIn,
} from "./auth/session";
export type { SignInMethods } from "./auth/methods";
export { mcpRoute } from "./mcp";
export { chatEnabled, chatRoute, voiceEnabled, voiceRoute } from "./chat-route";
export type { AboutKind, ChatLink } from "./chat";
export { dispatch as apiRoute } from "./http/api";
export { apiResourceMetadataRoute } from "./http/metadata";
export { mcpResource as mcpUrl, safeNext } from "./urls";

// What the pages read, as the signed-in player sees it: through the same gate as the tools, never asking for spoilers unless the
// player asked on the page.
export { briefing, type Briefing } from "./briefing";
export { buildOf, type BuildView } from "./builds";
export { codexOf, type CodexView } from "./codex";
export { getPlaythrough, listPlaythroughs, type PlaythroughView } from "./games";
export { itemsOf, type ItemView } from "./items";
export { questsOf, type QuestView } from "./quests";
export { getSession, sessionsOf, type SessionSummary, type SessionView } from "./sessions";
export { NotFoundError } from "./errors";
export { CODEX_KINDS, EFFECTS, OPEN_STATUSES, SPOILER_LEVELS, type ItemKind, type Player, type QuestStatus, type SpoilerLevel } from "./types";

// The health probe asks the database a trivial question; opening it (and migrating) is part of answering.
setDbProbe(async () => sql`select 1`.execute(await db()));
export { tagsInUse } from "./tags";
