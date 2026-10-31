// Sign-in: Better Auth, set up as ADR 0004 says, with its tables in their own file, ${DATA_DIR}/auth.sqlite, so a backup of the log holds
// no sessions, tokens or passkeys. Players sign in with an email code (and the mail's link), a passkey or an OpenID Connect provider; MCP clients through OAuth (@better-auth/mcp,
// with Client ID Metadata Documents from @better-auth/cimd), with access tokens bound to /mcp; scripts likewise, with tokens bound to
// /api/v1. Where the setup differs from Better Auth's
// defaults, and why, is in ADR 0004 and ADR 0006.
import { AsyncLocalStorage } from "node:async_hooks";
import { join } from "node:path";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { passkey } from "@better-auth/passkey";
import { defineRequestState } from "@better-auth/core/context";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { emailOTP } from "better-auth/plugins/email-otp";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { jwt } from "better-auth/plugins/jwt";
import { magicLink } from "better-auth/plugins/magic-link";
import { config, mayJoin } from "../config";
import { openSqlite } from "../db/connect";
import { logger } from "../log";
import { deletePlayerLog } from "../players";
import { secret } from "../secret";
import { processState } from "../state";
import { AUTH_PATH, apiResource, mcpResource, safeNext } from "../urls";
import { sendCode } from "./mail";

const log = logger("auth");

/** Seconds an MCP access token lives: a JWT can't be revoked before it expires, so it is short; the client refreshes it. */
export const ACCESS_TOKEN_SECONDS = 600;

// Whether this request comes from a login page an MCP client or a script sent the browser to: its signed query came along (the browser
// client adds it to every request from that page). The body the endpoints see has it stripped, so a hook notes it first.
const oauthSignIn = defineRequestState(() => false);

// A sign-in link is made only while a code mail is being written, and goes into that mail (ADR 0015): the link plugin's own endpoint,
// called from anywhere else, mails nothing.
const linkFor = new AsyncLocalStorage<{ url?: string }>();

/** A sign-in link for `email`, to the page the login page was asked for (its `next`, read off the Referer). */
async function signInLink(email: string, headers: Headers | undefined): Promise<string | undefined> {
  let next = "/";
  try {
    next = safeNext(new URL(headers?.get("referer") ?? "").searchParams.get("next"));
  } catch {
    // No Referer, or not a URL: the link opens the app.
  }
  const slot: { url?: string } = {};
  await linkFor.run(slot, async () =>
    (await auth()).api.signInMagicLink({
      body: { email, callbackURL: next, errorCallbackURL: `/login?${new URLSearchParams({ next })}` },
      headers: headers ?? new Headers(),
    }),
  );
  return slot.url;
}

// QUESTLOG_SECRET as given, else the generated one (secret.ts checks either is at least 32 bytes).
const authSecret = (): string => {
  const bytes = secret();
  return config.secret() ?? bytes.toString("hex");
};

function options(database: Awaited<ReturnType<typeof openSqlite>>) {
  const publicUrl = config.publicUrl();
  const providers = config.oidcProviders();
  return {
    appName: "questlog",
    baseURL: publicUrl,
    basePath: AUTH_PATH,
    secret: authSecret(),
    database,
    // Nothing turns telemetry on (V7): no `telemetry` option and no BETTER_AUTH_TELEMETRY.
    emailAndPassword: { enabled: false },
    // A second sign-in joins a player only when its provider says the address is verified. A provider listed in trustedProviders would
    // join even without that, so none is listed (ADR 0006).
    account: { accountLinking: { enabled: true, trustedProviders: [] } },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if ((ctx.body as { oauth_query?: unknown } | undefined)?.oauth_query) await oauthSignIn.set(true);
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // Who may become a player: QUESTLOG_SIGNUP_ALLOW.
          before: async (user: { email: string }) => {
            if (!mayJoin(user.email)) throw new APIError("FORBIDDEN", { message: "This address may not sign up here" });
          },
        },
        // A deleted player's log goes in the same request (ADR 0004): there is no foreign key across the two files.
        delete: { after: async (user: { id: string }) => deletePlayerLog({ id: user.id }) },
      },
    },
    plugins: [
      // Signs the access tokens; /mcp checks them against /api/auth/jwks.
      jwt(),
      mcp({
        loginPage: "/login",
        consentPage: "/consent",
        resource: mcpResource(),
        // The REST API is a second resource. A client is linked to /mcp when it registers; a script asks to be linked to /api/v1 too
        // (`resources` in its registration), then asks for a token with resource=${PUBLIC_URL}/api/v1 and gets one bound to it alone.
        resources: [apiResource()],
        clientRegistrationAllowedResources: [apiResource()],
        accessTokenExpiresIn: ACCESS_TOKEN_SECONDS,
        // Tokens only ever stand for a player: no client_credentials grant, whose tokens name no user.
        grantTypes: ["authorization_code", "refresh_token"],
        // claude.ai registers itself (RFC 7591), ADR 0004; clients with a metadata document use cimd() below.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
      // Codes and links are stored hashed: auth.sqlite holds no usable code or link.
      emailOTP({
        storeOTP: "hashed",
        sendVerificationOTP: async ({ email, otp, type }, ctx) => {
          if (type !== "sign-in") return;
          if (!config.smtp()) throw new APIError("BAD_REQUEST", { message: "Email codes are off on this instance" });
          // No mail to an address that may not sign up and isn't a player: nobody can use questlog to send mail to strangers.
          if (!mayJoin(email) && !(await ctx?.context.internalAdapter.findUserByEmail(email))) return;
          // During an MCP or script sign-in (the login page's signed query came along) the mail holds only the code: a link would sign in
          // whichever browser opens it, not the one the authorization waits in (ADR 0004).
          const link = (await oauthSignIn.get()) ? undefined : await signInLink(email, ctx?.request?.headers);
          await sendCode(email, otp, link);
        },
      }),
      magicLink({
        storeToken: "hashed",
        sendMagicLink: ({ url }) => {
          const slot = linkFor.getStore();
          if (slot) slot.url = url;
        },
      }),
      // Added on the account page while signed in; questlog is the relying party at PUBLIC_URL's host.
      passkey({ rpID: new URL(publicUrl).hostname, rpName: "questlog", origin: new URL(publicUrl).origin }),
      genericOAuth({
        config: providers.map((p) => ({
          providerId: p.id,
          name: p.label,
          discoveryUrl: `${p.issuer}/.well-known/openid-configuration`,
          clientId: p.clientId,
          clientSecret: p.clientSecret || undefined,
          scopes: ["openid", "email", "profile"],
          pkce: true,
        })),
      }),
    ],
  };
}

function create(database: Awaited<ReturnType<typeof openSqlite>>) {
  return betterAuth(options(database));
}

export type Auth = ReturnType<typeof create>;

const state = processState("auth", () => ({ auth: undefined as Promise<Auth> | undefined }));

async function open(file: string): Promise<Auth> {
  const database = await openSqlite(file);
  try {
    // Better Auth's own tables, created and extended as its version and plugins need; nothing of questlog's is in this file.
    const { runMigrations } = await getMigrations(options(database));
    await runMigrations();
    return create(database);
  } catch (e) {
    database.close();
    log.error({ err: e }, "opening auth.sqlite failed");
    throw e;
  }
}

/** Better Auth; the first call opens `${DATA_DIR}/auth.sqlite` and migrates it. A failed open is not remembered. */
export function auth(): Promise<Auth> {
  if (!state.auth) {
    const p = open(join(config.dataDir(), "auth.sqlite"));
    state.auth = p;
    p.catch(() => {
      if (state.auth === p) state.auth = undefined;
    });
  }
  return state.auth;
}

/** Test only: a fresh Better Auth over an in-memory database, with the environment as it is now. */
export async function resetAuthForTests(): Promise<Auth> {
  state.auth = open(":memory:");
  return state.auth;
}
