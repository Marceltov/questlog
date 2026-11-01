// Sign-in end to end, over HTTP as claude.ai does it: /mcp refuses without a token and points to its metadata, a client registers, the
// player signs in with an email code and consents, the client swaps the code for a token bound to /mcp, and the tools answer as that
// player. Better Auth runs for real, over an in-memory auth.sqlite; only the mail is caught.
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { resetDbForTests } from "../db/testing";
import { dispatch } from "../http/api";
import { apiResourceMetadataRoute } from "../http/metadata";
import { mcpRoute } from "../mcp";
import { questsOf } from "../quests";
import { resetSecretForTests } from "../secret";
import { auth, resetAuthForTests } from "./auth";
import { setMailerForTests } from "./mail";
import { authRoute, authServerMetadataRoute, playerFromHeaders } from "./session";

let server: Server;
let base = "";
const codes = new Map<string, string>();
const links = new Map<string, string>();

// The routes of app/, without Next: what each path is answered by.
function route(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname;
  if (path === "/mcp") return mcpRoute(req);
  if (path.startsWith("/api/v1/")) return dispatch(req, path.slice("/api/v1/".length).split("/").map(decodeURIComponent));
  if (path === "/.well-known/oauth-protected-resource/api/v1") return Promise.resolve(apiResourceMetadataRoute());
  // A stand-in OpenID Connect provider: only its discovery document.
  if (path === "/fake-oidc/.well-known/openid-configuration")
    return Promise.resolve(
      Response.json({
        issuer: `${base}/fake-oidc`,
        authorization_endpoint: `${base}/fake-oidc/authorize`,
        token_endpoint: `${base}/fake-oidc/token`,
        jwks_uri: `${base}/fake-oidc/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
      }),
    );
  if (path.startsWith("/.well-known/oauth-authorization-server")) return authServerMetadataRoute(req);
  return authRoute(req);
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = new Headers(
      Object.entries(req.headers).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v === undefined ? [] : [[k, v]])) as [string, string][],
    );
    const reply = await route(
      new Request(new URL(req.url!, base), { method: req.method, headers, body: req.method === "GET" || req.method === "HEAD" ? undefined : body }),
    ).catch((e) => (console.error(e), new Response("thrown", { status: 599 })));
    for (const [k, v] of reply.headers) if (k !== "set-cookie") res.setHeader(k, v);
    const cookies = reply.headers.getSetCookie();
    if (cookies.length) res.setHeader("set-cookie", cookies);
    res.writeHead(reply.status);
    res.end(Buffer.from(await reply.arrayBuffer()));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  base = `http://localhost:${port}`;
  vi.stubEnv("PORT", String(port));
  vi.stubEnv("PUBLIC_URL", base);
  vi.stubEnv("DATA_DIR", mkdtempSync(join(tmpdir(), "gamepanion-")));
  vi.stubEnv("GAMEPANION_SECRET", "s".repeat(40));
  vi.stubEnv("GAMEPANION_SMTP_URL", "smtp://mail.invalid");
  vi.stubEnv("GAMEPANION_SMTP_FROM", "Gamepanion@example.com");
  vi.stubEnv("GAMEPANION_SIGNUP_ALLOW", "ada@example.com");
  vi.stubEnv("GAMEPANION_OIDC_FAKE_ISSUER", `${base}/fake-oidc`);
  vi.stubEnv("GAMEPANION_OIDC_FAKE_CLIENT_ID", "gamepanion-client");
  resetSecretForTests();
  setMailerForTests(async (to, code, link) => {
    codes.set(to, code);
    if (link) links.set(to, link);
    else links.delete(to);
  });
  await resetDbForTests();
  await resetAuthForTests();
});

afterAll(async () => {
  setMailerForTests(undefined);
  vi.unstubAllEnvs();
  resetSecretForTests();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
});

const json = (body: unknown, extra: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", origin: base, ...extra },
  body: JSON.stringify(body),
});
const cookieOf = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

const V = "2026-07-28";
const META = {
  "io.modelcontextprotocol/protocolVersion": V,
  "io.modelcontextprotocol/clientInfo": { name: "t", version: "0" },
  "io.modelcontextprotocol/clientCapabilities": {},
};
const rpc = (method: string, params: Record<string, unknown>, headers: Record<string, string> = {}) =>
  fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": V,
      "mcp-method": method,
      ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}),
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: META } }),
  });

/** Signs `email` in through the email code, carrying the signed query of the login page the authorize step sent the browser to (the
 * browser's client sends it with every request from that page). */
async function signIn(email: string, oauthQuery?: string) {
  const query = oauthQuery ? { oauth_query: oauthQuery } : {};
  const sent = await fetch(`${base}/api/auth/email-otp/send-verification-otp`, json({ email, type: "sign-in", ...query }));
  expect(sent.status).toBe(200);
  return fetch(`${base}/api/auth/sign-in/email-otp`, json({ email, otp: codes.get(email), ...query }));
}

test("an MCP client signs the player in and calls the tools as them; nothing else gets in", async () => {
  // /mcp without a token: 401, pointing at the protected-resource metadata.
  const bare = await rpc("tools/list", {});
  expect(bare.status).toBe(401);
  const challenge = bare.headers.get("www-authenticate") ?? "";
  expect(challenge).toContain(`${base}/.well-known/oauth-protected-resource/mcp`);

  const resource = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json();
  expect(resource.resource).toBe(`${base}/mcp`);
  const issuer = resource.authorization_servers[0];
  expect(issuer).toBe(`${base}/api/auth`);
  const meta = await (await fetch(`${base}/.well-known/oauth-authorization-server/api/auth`)).json();
  expect(meta.code_challenge_methods_supported).toContain("S256");
  expect(meta.grant_types_supported).not.toContain("client_credentials");

  // Dynamic client registration, as claude.ai does it.
  const redirect = "https://claude.example/api/mcp/auth_callback";
  const reg = await fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Test client",
      redirect_uris: [redirect],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(reg.status).toBe(201);
  const { client_id } = await reg.json();

  // Authorize: the player isn't signed in, so the browser goes to the login page with a signed query.
  const verifier = randomBytes(32).toString("base64url");
  const authorize = new URL(meta.authorization_endpoint);
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id,
    redirect_uri: redirect,
    scope: "openid offline_access",
    state: "st",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    resource: `${base}/mcp`,
  }))
    authorize.searchParams.set(k, v);
  // A browser navigating gets a 302; Node's fetch always sends sec-fetch-mode: cors, so Better Auth answers with the same URL as JSON.
  const toLogin = await fetch(authorize, { redirect: "manual", headers: { accept: "text/html" } });
  const login = new URL(toLogin.status === 302 ? toLogin.headers.get("location")! : (await toLogin.json()).url, base);
  expect(login.pathname).toBe("/login");

  // Sign-up is refused for an address that isn't allowed, and no code is even sent to it.
  codes.clear();
  const stranger = await signIn("eve@example.com", login.search.slice(1));
  expect(stranger.ok).toBe(false);
  expect(codes.has("eve@example.com")).toBe(false);

  // The email code; the mail holds only the code, no link: a sign-in someone else started can't be finished by clicking the mail.
  const signed = await signIn("ada@example.com", login.search.slice(1));
  expect(signed.status).toBe(200);
  expect(links.has("ada@example.com")).toBe(false);
  const cookie = cookieOf(signed);
  const afterLogin = await signed.json();
  const consent = new URL(afterLogin.url, base);
  expect(consent.pathname).toBe("/consent");

  // The session cookie never works on /mcp.
  expect((await rpc("tools/list", {}, { cookie })).status).toBe(401);

  const consented = await fetch(`${base}/api/auth/oauth2/consent`, json({ accept: true, oauth_query: consent.search.slice(1) }, { cookie }));
  expect(consented.status).toBe(200);
  const back = new URL((await consented.json()).url);
  expect(`${back.origin}${back.pathname}`).toBe(redirect);
  expect(back.searchParams.get("state")).toBe("st");
  expect(back.searchParams.get("iss")).toBe(issuer);

  const token = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: back.searchParams.get("code")!,
      redirect_uri: redirect,
      client_id,
      code_verifier: verifier,
      resource: `${base}/mcp`,
    }),
  });
  expect(token.status).toBe(200);
  const tokens = await token.json();
  expect(tokens.expires_in).toBeLessThanOrEqual(600);
  expect(tokens.refresh_token).toEqual(expect.any(String));
  const bearer = { authorization: `Bearer ${tokens.access_token}` };

  // The tools, as the player who signed in.
  const list = await (await rpc("tools/list", {}, bearer)).json();
  expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(["record", "briefing", "open_threads", "item", "codex", "correct", "missed"]);
  const filed = await (
    await rpc(
      "tools/call",
      { name: "record", arguments: { game: "Lies of P", summary: "Met Venigni.", transcript: "Met Venigni.", quests: [{ name: "Venigni's Workers" }] } },
      bearer,
    )
  ).json();
  expect(filed.result.isError).toBeUndefined();
  expect(filed.result.structuredContent.url).toBe(`${base}/s/${filed.result.structuredContent.sessionId}`);
  const playerId = (await playerFromHeaders(new Headers({ cookie })))!.id;
  expect((await questsOf({ id: playerId }, filed.result.structuredContent.playthrough.id)).map((q) => q.name)).toEqual(["Venigni's Workers"]);

  // A forged or altered token gets nothing; another page's Origin neither.
  expect((await rpc("tools/list", {}, { authorization: `Bearer ${tokens.access_token.slice(0, -4)}AAAA` })).status).toBe(401);
  expect((await rpc("tools/list", {}, { ...bearer, origin: "https://evil.example" })).status).toBe(403);

  // Deleting the player deletes their log, and their token stops working.
  const ctx = await (await auth()).$context;
  await ctx.internalAdapter.deleteUser(playerId);
  await expect(questsOf({ id: playerId }, filed.result.structuredContent.playthrough.id)).rejects.toThrow();
  expect((await rpc("tools/list", {}, bearer)).status).toBe(401);
});

test("telemetry stays off and codes are stored hashed", async () => {
  const ctx = await (await auth()).$context;
  expect((ctx.options as { telemetry?: unknown }).telemetry).toBeUndefined();
  codes.clear();
  await fetch(`${base}/api/auth/email-otp/send-verification-otp`, json({ email: "ada@example.com", type: "sign-in" }));
  const code = codes.get("ada@example.com")!;
  const rows = (await ctx.adapter.findMany({ model: "verification" })) as { value: string }[];
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) expect(r.value).not.toContain(code);
});

test("outside an MCP sign-in the mail holds a link as well; it signs the player in once, to the page they wanted, and is stored hashed", async () => {
  codes.clear();
  const login = `${base}/login?next=${encodeURIComponent("/p/abc")}`;
  const sent = await fetch(`${base}/api/auth/email-otp/send-verification-otp`, json({ email: "ada@example.com", type: "sign-in" }, { referer: login }));
  expect(sent.status).toBe(200);
  expect(codes.has("ada@example.com")).toBe(true);
  const link = new URL(links.get("ada@example.com")!);
  expect(`${link.origin}${link.pathname}`).toBe(`${base}/api/auth/magic-link/verify`);
  expect(link.searchParams.get("callbackURL")).toBe("/p/abc");

  const ctx = await (await auth()).$context;
  const rows = (await ctx.adapter.findMany({ model: "verification" })) as { identifier: string; value: string }[];
  for (const r of rows) expect(`${r.identifier} ${r.value}`).not.toContain(link.searchParams.get("token")!);

  const opened = await fetch(link, { redirect: "manual" });
  expect(opened.status).toBe(302);
  expect(new URL(opened.headers.get("location")!, base).pathname).toBe("/p/abc");
  expect(await playerFromHeaders(new Headers({ cookie: cookieOf(opened) }))).not.toBeNull();
  const again = await fetch(link, { redirect: "manual" });
  expect(cookieOf(again)).not.toContain("session_token=");

  // A page that isn't Gamepanion's own can't be where the link leads.
  await fetch(
    `${base}/api/auth/email-otp/send-verification-otp`,
    json({ email: "ada@example.com", type: "sign-in" }, { referer: `${base}/login?next=//evil.example` }),
  );
  expect(new URL(links.get("ada@example.com")!).searchParams.get("callbackURL")).toBe("/");
});

test("passkeys: Gamepanion is the relying party at PUBLIC_URL's host, and only a signed-in player can add one", async () => {
  const options = await fetch(`${base}/api/auth/passkey/generate-register-options`);
  expect(options.status).toBe(401);
  const signed = await signIn("ada@example.com");
  const cookie = cookieOf(signed);
  const mine = await fetch(`${base}/api/auth/passkey/generate-register-options`, { headers: { cookie } });
  expect(mine.status).toBe(200);
  const body = await mine.json();
  expect(body.rp).toEqual({ id: "localhost", name: "Gamepanion" });
  expect(body.user.name).toBe("ada@example.com");
  expect((await fetch(`${base}/api/auth/passkey/list-user-passkeys`, { headers: { cookie } })).status).toBe(200);
  const signInOptions = await fetch(`${base}/api/auth/passkey/generate-authenticate-options`);
  expect((await signInOptions.json()).rpId).toBe("localhost");
});

test("an OpenID Connect provider from GAMEPANION_OIDC_<NAME>_* sends the browser to it, with PKCE and Gamepanion's callback", async () => {
  const r = await fetch(`${base}/api/auth/sign-in/social`, json({ provider: "fake", callbackURL: "/" }));
  expect(r.status).toBe(200);
  const to = new URL((await r.json()).url);
  expect(`${to.origin}${to.pathname}`).toBe(`${base}/fake-oidc/authorize`);
  expect(to.searchParams.get("client_id")).toBe("gamepanion-client");
  expect(to.searchParams.get("redirect_uri")).toBe(`${base}/api/auth/callback/fake`);
  expect(to.searchParams.get("code_challenge_method")).toBe("S256");
});

/** A token for `resource`, through the whole flow: registration, authorize, the email code, consent, the token endpoint. */
async function tokenFor(resource: string) {
  const meta = await (await fetch(`${base}/.well-known/oauth-authorization-server/api/auth`)).json();
  const redirect = "http://127.0.0.1:8123/callback";
  const reg = await fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "A script",
      application_type: "native",
      resources: [resource],
      redirect_uris: [redirect],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    }),
  });
  expect(reg.status).toBe(201);
  const { client_id } = await reg.json();
  const verifier = randomBytes(32).toString("base64url");
  const authorize = new URL(meta.authorization_endpoint);
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id,
    redirect_uri: redirect,
    scope: "openid",
    state: "st",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    resource,
  }))
    authorize.searchParams.set(k, v);
  const toLogin = await fetch(authorize, { redirect: "manual", headers: { accept: "text/html" } });
  const login = new URL(toLogin.status === 302 ? toLogin.headers.get("location")! : (await toLogin.json()).url, base);
  const signed = await signIn("ada@example.com", login.search.slice(1));
  const cookie = cookieOf(signed);
  const consent = new URL((await signed.json()).url, base);
  const consented = await fetch(`${base}/api/auth/oauth2/consent`, json({ accept: true, oauth_query: consent.search.slice(1) }, { cookie }));
  const answer = await consented.json();
  if (!answer.url) throw new Error(`consent for ${resource}: ${consented.status} ${JSON.stringify(answer)} (sign-in went to ${consent.pathname})`);
  const back = new URL(answer.url);
  const token = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: back.searchParams.get("code")!,
      redirect_uri: redirect,
      client_id,
      code_verifier: verifier,
      resource,
    }),
  });
  expect(token.status).toBe(200);
  return { access: (await token.json()).access_token as string, cookie };
}

test("a script gets a token bound to /api/v1; it works there and not on /mcp, and an /mcp token not on /api/v1", async () => {
  const meta = await (await fetch(`${base}/.well-known/oauth-protected-resource/api/v1`)).json();
  expect(meta).toEqual(expect.objectContaining({ resource: `${base}/api/v1`, authorization_servers: [`${base}/api/auth`] }));

  const api = await tokenFor(`${base}/api/v1`);
  const bearer = { authorization: `Bearer ${api.access}` };
  const listed = await fetch(`${base}/api/v1/playthroughs`, { headers: bearer });
  expect(listed.status).toBe(200);
  expect(await listed.json()).toEqual({ playthroughs: [] });
  const filed = await fetch(`${base}/api/v1/sessions`, {
    method: "POST",
    headers: { ...bearer, "content-type": "application/json" },
    body: JSON.stringify({ game: "Lies of P", summary: "Met Venigni.", transcript: "Met Venigni." }),
  });
  expect(filed.status).toBe(201);
  expect((await filed.json()).url).toMatch(new RegExp(`^${base}/s/`));
  expect((await rpc("tools/list", {}, bearer)).status).toBe(401);

  // The session cookie doesn't count on the API, and neither does a token for /mcp.
  expect((await fetch(`${base}/api/v1/playthroughs`, { headers: { cookie: api.cookie } })).status).toBe(401);
  const mcp = await tokenFor(`${base}/mcp`);
  expect((await rpc("tools/list", {}, { authorization: `Bearer ${mcp.access}` })).status).toBe(200);
  const refused = await fetch(`${base}/api/v1/playthroughs`, { headers: { authorization: `Bearer ${mcp.access}` } });
  expect(refused.status).toBe(401);
  expect(refused.headers.get("www-authenticate")).toContain(`${base}/.well-known/oauth-protected-resource/api/v1`);
});

test("a client registered without asking for /api/v1, as claude.ai registers, can't get a token for it", async () => {
  const meta = await (await fetch(`${base}/.well-known/oauth-authorization-server/api/auth`)).json();
  const redirect = "https://claude.example/api/mcp/auth_callback";
  const reg = await fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "MCP only",
      redirect_uris: [redirect],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    }),
  });
  const { client_id } = await reg.json();
  const authorize = new URL(meta.authorization_endpoint);
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id,
    redirect_uri: redirect,
    scope: "openid",
    code_challenge: createHash("sha256").update("x".repeat(43)).digest("base64url"),
    code_challenge_method: "S256",
    resource: `${base}/api/v1`,
  }))
    authorize.searchParams.set(k, v);
  const r = await fetch(authorize, { redirect: "manual", headers: { accept: "text/html" } });
  const to = new URL(r.status === 302 ? r.headers.get("location")! : (await r.json()).url);
  expect(to.searchParams.get("error")).toBe("invalid_target");
});
