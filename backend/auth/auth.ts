// Sign-in: Better Auth, set up as ADR 0004 says, with its tables in their own file, ${DATA_DIR}/auth.sqlite, so a backup of the log holds
// no sessions or tokens. Players sign in with an email code or an OpenID Connect provider; MCP clients through OAuth (@better-auth/mcp,
// with Client ID Metadata Documents from @better-auth/cimd), with access tokens bound to /mcp. Where the setup differs from Better Auth's
// defaults, and why, is in ADR 0004 and ADR 0005.
import { join } from "node:path";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { emailOTP } from "better-auth/plugins/email-otp";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { jwt } from "better-auth/plugins/jwt";
import { config, mayJoin } from "../config";
import { openSqlite } from "../db/connect";
import { logger } from "../log";
import { deletePlayerLog } from "../players";
import { secret } from "../secret";
import { processState } from "../state";
import { AUTH_PATH, mcpResource } from "../urls";
import { sendCode } from "./mail";

const log = logger("auth");

/** Seconds an MCP access token lives: a JWT can't be revoked before it expires, so it is short; the client refreshes it. */
export const ACCESS_TOKEN_SECONDS = 600;

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
    // join even without that, so none is listed (ADR 0005).
    account: { accountLinking: { enabled: true, trustedProviders: [] } },
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
        accessTokenExpiresIn: ACCESS_TOKEN_SECONDS,
        // Tokens only ever stand for a player: no client_credentials grant, whose tokens name no user.
        grantTypes: ["authorization_code", "refresh_token"],
        // claude.ai registers itself (RFC 7591), ADR 0004; clients with a metadata document use cimd() below.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
      // Codes are stored hashed: auth.sqlite holds no usable code.
      emailOTP({
        storeOTP: "hashed",
        sendVerificationOTP: async ({ email, otp, type }, ctx) => {
          if (type !== "sign-in") return;
          if (!config.smtp()) throw new APIError("BAD_REQUEST", { message: "Email codes are off on this instance" });
          // No mail to an address that may not sign up and isn't a player: nobody can use questlog to send mail to strangers.
          if (!mayJoin(email) && !(await ctx?.context.internalAdapter.findUserByEmail(email))) return;
          await sendCode(email, otp);
        },
      }),
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
