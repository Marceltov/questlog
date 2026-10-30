// Who is asking, on each surface. Pages: Better Auth's HttpOnly session cookie. /mcp: an OAuth access token bound to /mcp (mcp.ts); the
// cookie never counts there, and a token never counts on the pages. Either names a Better Auth user, who must still exist.
import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import type { Player } from "../types";
import { auth } from "./auth";

/** The signed-in player of a page request, from its session cookie; null when there is none or it is no longer valid. */
export async function playerFromHeaders(headers: Headers): Promise<Player | null> {
  const s = await (await auth()).api.getSession({ headers });
  return s ? { id: s.user.id } : null;
}

/** The player a token's subject names, while that user exists; null otherwise. */
export async function playerById(id: string): Promise<Player | null> {
  const ctx = await (await auth()).$context;
  return (await ctx.internalAdapter.findUserById(id)) ? { id } : null;
}

/** Everything under /api/auth, and the protected-resource metadata of /mcp: Better Auth answers. */
export const authRoute = async (req: Request): Promise<Response> => (await auth()).handler(req);

/** /.well-known/oauth-authorization-server/api/auth (RFC 8414), which Better Auth can't serve from under its base path. */
export const authServerMetadataRoute = async (req: Request): Promise<Response> => oauthProviderAuthServerMetadata(await auth())(req);

/** /.well-known/openid-configuration/api/auth, likewise. */
export const openIdConfigRoute = async (req: Request): Promise<Response> => oauthProviderOpenIdConfigMetadata(await auth())(req);

/** The sign-in methods this instance offers, for the sign-in page. */
export { signInMethods } from "./methods";

/** The name of the OAuth client a consent page asks about; null when it isn't known. */
export async function clientName(headers: Headers, clientId: string): Promise<string | null> {
  try {
    const c = (await (await auth()).api.getOAuthClientPublic({ query: { client_id: clientId }, headers })) as { client_name?: string } | null;
    return c?.client_name || null;
  } catch {
    return null;
  }
}

/** The signed-in user's display name or address, for the consent page. */
export async function signedInAs(headers: Headers): Promise<string | null> {
  const s = await (await auth()).api.getSession({ headers });
  return s ? s.user.name || s.user.email : null;
}
