import { afterEach, expect, test, vi } from "vitest";
import { config, mayJoin } from "./config";

afterEach(() => vi.unstubAllEnvs());

test("OIDC providers come from QUESTLOG_OIDC_<NAME>_*, each needing an issuer and a client id", () => {
  vi.stubEnv("QUESTLOG_OIDC_AUTHENTIK_ISSUER", "https://auth.example.com/application/o/questlog/");
  vi.stubEnv("QUESTLOG_OIDC_AUTHENTIK_CLIENT_ID", "id");
  vi.stubEnv("QUESTLOG_OIDC_AUTHENTIK_CLIENT_SECRET", "secret");
  vi.stubEnv("QUESTLOG_OIDC_GOOGLE_LABEL", "Google"); // no issuer: not a provider
  expect(config.oidcProviders()).toEqual([
    { id: "authentik", label: "Authentik", issuer: "https://auth.example.com/application/o/questlog", clientId: "id", clientSecret: "secret" },
  ]);
  vi.stubEnv("QUESTLOG_OIDC_AUTHENTIK_LABEL", "Homelab");
  expect(config.oidcProviders()[0].label).toBe("Homelab");
  vi.stubEnv("QUESTLOG_OIDC_AUTHENTIK_CLIENT_ID", "");
  expect(() => config.oidcProviders()).toThrow(/QUESTLOG_OIDC_AUTHENTIK_CLIENT_ID/);
});

test("QUESTLOG_SIGNUP_ALLOW: addresses, @domain or *; empty lets nobody new in", () => {
  expect(mayJoin("ada@example.com", [])).toBe(false);
  expect(mayJoin("Ada@Example.com", ["ada@example.com"])).toBe(true);
  expect(mayJoin("ben@example.com", ["@example.com"])).toBe(true);
  expect(mayJoin("ben@example.com.evil", ["@example.com"])).toBe(false);
  expect(mayJoin("eve@other.org", ["*"])).toBe(true);
});

test("PUBLIC_URL is required in production and defaults to localhost otherwise", () => {
  vi.stubEnv("PUBLIC_URL", "");
  vi.stubEnv("PORT", "4000");
  expect(config.publicUrl()).toBe("http://localhost:4000");
  vi.stubEnv("NODE_ENV", "production");
  expect(() => config.publicUrl()).toThrow(/PUBLIC_URL must be set/);
  vi.stubEnv("PUBLIC_URL", "https://questlog.example.com/");
  expect(config.publicUrl()).toBe("https://questlog.example.com");
});

test("SMTP needs a sender", () => {
  vi.stubEnv("QUESTLOG_SMTP_URL", "smtp://mail.example.com");
  expect(() => config.smtp()).toThrow(/QUESTLOG_SMTP_FROM/);
  vi.stubEnv("QUESTLOG_SMTP_FROM", "questlog@example.com");
  expect(config.smtp()).toEqual({ url: "smtp://mail.example.com", from: "questlog@example.com" });
});
