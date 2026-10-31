// Who is asking, on each surface. Pages: Better Auth's HttpOnly session cookie. /mcp: an OAuth access token bound to /mcp (mcp.ts).
// /api/v1: an OAuth access token bound to /api/v1. The cookie never counts on either, a token never counts on the pages, and a token for
// one of the two never counts on the other. Each names a Better Auth user, who must still exist.
import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { requestToResourceInput, verifyAccessTokenRequest } from "better-auth/oauth2";
import type { Player } from "../types";
import { apiResource, issuer, jwksUrl } from "../urls";
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

/**
 * The player an /api/v1 request's access token stands for: a JWT from this instance (signature, issuer, expiry, DPoP when bound) whose
 * audience is /api/v1, for a user who still exists. Null for anything else, an /mcp token included.
 */
export async function playerFromApiToken(req: Request): Promise<Player | null> {
  try {
    const claims = await verifyAccessTokenRequest(requestToResourceInput(req), {
      verifyOptions: { issuer: issuer(), audience: apiResource() },
      jwksUrl: jwksUrl(),
    });
    return typeof claims.sub === "string" ? await playerById(claims.sub) : null;
  } catch {
    return null;
  }
}

/** Everything under /api/auth, and the protected-resource metadata of /mcp: Better Auth answers. */
export const authRoute = async (req: Request): Promise<Response> => (await auth()).handler(req);

/** /.well-known/oauth-authorization-server/api/auth (RFC 8414), which Better Auth can't serve from under its base path. */
export const authServerMetadataRoute = async (req: Request): Promise<Response> => oauthProviderAuthServerMetadata(await auth())(req);

/** /.well-known/openid-configuration/api/auth, likewise. */
export const openIdConfigRoute = async (req: Request): Promise<Response> => oauthProviderOpenIdConfigMetadata(await auth())(req);

/** The sign-in methods this instance offers, for the sign-in page. */
export { signInMethods } from "./methods";
export { refusedSignIn, type RefusedSignIn } from "./refused";

/** The name of the OAuth client a consent page asks about; null when it isn't known. */
export async function clientName(headers: Headers, clientId: string): Promise<string | null> {
  try {
    const c = (await (await auth()).api.getOAuthClientPublic({ query: { client_id: clientId }, headers })) as { client_name?: string } | null;
    return c?.client_name || null;
  } catch {
    return null;
  }
}

export type PasskeyView = { id: string; name: string | null; createdAt: string };

/** The signed-in player's passkeys, newest first, for the account page. */
export async function passkeysOf(headers: Headers): Promise<PasskeyView[]> {
  const list = await (await auth()).api.listPasskeys({ headers });
  return list
    .map((p) => ({ id: p.id, name: p.name || null, createdAt: new Date(p.createdAt).toISOString() }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The signed-in user's display name or address, for the consent page. */
export async function signedInAs(headers: Headers): Promise<string | null> {
  const s = await (await auth()).api.getSession({ headers });
  return s ? s.user.name || s.user.email : null;
}
