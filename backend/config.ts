// Every environment variable the backend reads. Getters, not constants: tests change the environment between cases, and
// DATA_DIR is only known at runtime. Keep .env.example, compose.yaml and docs/self-hosting/configuration.md in step.
const env = (name: string) => process.env[name] ?? "";

export const LOG_LEVELS = ["error", "warn", "info", "debug", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** One OpenID Connect provider, from QUESTLOG_OIDC_<NAME>_*. `id` is the name in lower case; it is part of the callback URL. */
export type OidcProvider = { id: string; label: string; issuer: string; clientId: string; clientSecret: string };

const OIDC_VAR = /^QUESTLOG_OIDC_([A-Z0-9]+)_(ISSUER|CLIENT_ID|CLIENT_SECRET|LABEL)$/;

// Every provider that has an issuer. A provider with an issuer but no client id is a mistake, and fails loudly at start-up.
function oidcProviders(): OidcProvider[] {
  const names = new Set<string>();
  for (const key of Object.keys(process.env)) {
    const m = OIDC_VAR.exec(key);
    if (m && env(key).trim()) names.add(m[1]);
  }
  return [...names]
    .sort()
    .filter((name) => env(`QUESTLOG_OIDC_${name}_ISSUER`).trim())
    .map((name) => {
      const v = (field: string) => env(`QUESTLOG_OIDC_${name}_${field}`).trim();
      if (!v("CLIENT_ID")) throw new Error(`QUESTLOG_OIDC_${name}_ISSUER is set, so QUESTLOG_OIDC_${name}_CLIENT_ID must be too`);
      const issuer = v("ISSUER").replace(/\/+$/, "");
      try {
        new URL(issuer);
      } catch {
        throw new Error(`QUESTLOG_OIDC_${name}_ISSUER must be a URL, got "${issuer}"`);
      }
      return {
        id: name.toLowerCase(),
        label: v("LABEL") || name.charAt(0) + name.slice(1).toLowerCase(),
        issuer,
        clientId: v("CLIENT_ID"),
        clientSecret: v("CLIENT_SECRET"),
      };
    });
}

// The address clients reach this instance at; no trailing slash. Better Auth's base URL and the MCP resource are built from it, so it
// can't come from a request. In development it defaults to localhost; a production server refuses to start without it.
function publicUrl(): string {
  const v = env("PUBLIC_URL").trim().replace(/\/+$/, "");
  if (v) {
    try {
      new URL(v);
    } catch {
      throw new Error(`PUBLIC_URL must be a URL such as https://questlog.example.com, got "${v}"`);
    }
    return v;
  }
  if (process.env.NODE_ENV === "production") throw new Error("PUBLIC_URL must be set: the address players and Claude reach questlog at");
  return `http://localhost:${port()}`;
}

function port(): number {
  const n = Number.parseInt(env("PORT").trim(), 10);
  return Number.isInteger(n) && n > 0 ? n : 3000;
}

// The zone "today" is computed in: TZ, or Europe/Berlin when unset. Must be an IANA zone name.
function timeZone(): string {
  const tz = env("TZ").trim() || "Europe/Berlin";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  } catch {
    throw new Error(`TZ must be an IANA time zone such as Europe/Berlin, got "${tz}"`);
  }
  return tz;
}

export const config = {
  // Where questlog.sqlite, auth.sqlite and the generated secret live.
  dataDir: () => env("DATA_DIR") || "/data",
  publicUrl,
  port,
  timeZone,
  // Empty means unset: compose passes ${QUESTLOG_SECRET:-}.
  secret: (): string | undefined => env("QUESTLOG_SECRET") || undefined,
  oidcProviders,
  // Email codes: on only with an SMTP server to send them through.
  smtp: (): { url: string; from: string } | undefined => {
    const url = env("QUESTLOG_SMTP_URL").trim();
    if (!url) return undefined;
    const from = env("QUESTLOG_SMTP_FROM").trim();
    if (!from) throw new Error("QUESTLOG_SMTP_URL is set, so QUESTLOG_SMTP_FROM must be too (the sender address of the codes)");
    return { url, from };
  },
  // Who may become a player: comma-separated addresses, @domain entries or *, trimmed and lowercased. Empty: nobody new; players who
  // exist keep signing in.
  signupAllow: (): string[] =>
    env("QUESTLOG_SIGNUP_ALLOW")
      .split(",")
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean),
  // The in-app chat (ADR 0013): on only with an API key. The model is settable; the daily limit counts messages per player.
  anthropicKey: (): string | undefined => env("QUESTLOG_ANTHROPIC_API_KEY").trim() || undefined,
  anthropicModel: (): string => env("QUESTLOG_ANTHROPIC_MODEL").trim() || "claude-opus-5-5",
  chatDailyLimit: (): number => {
    const n = Number.parseInt(env("QUESTLOG_CHAT_DAILY_LIMIT").trim(), 10);
    return Number.isInteger(n) && n > 0 ? n : 100;
  },
  // Speaking into the chat: a Whisper server with the OpenAI-compatible POST /v1/audio/transcriptions (such as speaches); no trailing
  // slash. Unset: the chat takes typing only.
  transcribeUrl: (): string | undefined => env("QUESTLOG_TRANSCRIBE_URL").trim().replace(/\/+$/, "") || undefined,
  transcribeModel: (): string => env("QUESTLOG_TRANSCRIBE_MODEL").trim() || "deepdml/faster-whisper-large-v3-turbo-ct2",
  // Unset, empty or not a level → info.
  logLevel: (): LogLevel => ((l) => ((LOG_LEVELS as readonly string[]).includes(l) ? (l as LogLevel) : "info"))(env("QUESTLOG_LOG_LEVEL").trim().toLowerCase()),
};

/** Whether `email` may become a player under QUESTLOG_SIGNUP_ALLOW. */
export function mayJoin(email: string, allow: string[] = config.signupAllow()): boolean {
  const e = email.trim().toLowerCase();
  const domain = e.slice(e.lastIndexOf("@"));
  return allow.some((a) => a === "*" || a === e || (a.startsWith("@") && a === domain));
}
