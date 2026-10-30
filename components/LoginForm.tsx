"use client";
// The sign-in: an email code, or an OpenID Connect provider. When an MCP client sent the player here (the URL carries Better Auth's
// signed authorize query, which oauthProviderClient sends along), a sign-in continues that authorization instead of opening the app.
import { useState } from "react";
import { authClient } from "./auth-client";
import { copy } from "./copy";

type Methods = { emailCode: boolean; providers: { id: string; label: string }[] };

// Where a finished sign-in goes: Better Auth's next step of the authorization, or the page the player wanted.
function go(data: unknown, next: string) {
  const url = typeof data === "object" && data && "url" in data && typeof data.url === "string" ? data.url : null;
  window.location.assign(url ?? next);
}

export function LoginForm({ methods, next }: { methods: Methods; next: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setBusy(false);
    if (error) setError(copy.sendFailed);
    else setSent(true);
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.signIn.emailOtp({ email, otp: code.trim() });
    if (error) {
      setBusy(false);
      setError(copy.signInFailed);
      return;
    }
    go(data, next);
  }

  // genericOAuth registers each provider as a social one; Better Auth carries an MCP client's authorize query through it by itself.
  async function provider(id: string) {
    setBusy(true);
    const { data, error } = await authClient.signIn.social({ provider: id, callbackURL: next, errorCallbackURL: "/login?error=1" });
    if (error) {
      setBusy(false);
      setError(copy.signInFailed);
      return;
    }
    go(data, next);
  }

  if (!methods.emailCode && !methods.providers.length) return <p className="text-muted">{copy.noMethods}</p>;

  return (
    <div className="space-y-5">
      {methods.emailCode &&
        (sent ? (
          <form onSubmit={signIn} className="space-y-3">
            <p className="text-sm text-muted">{copy.codeSent(email)}</p>
            <label className="block">
              <span className="text-sm font-semibold">{copy.codeLabel}</span>
              <input
                className="field mt-1 tracking-[0.3em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
              />
            </label>
            <button className="button-primary w-full" disabled={busy}>
              {copy.signIn}
            </button>
            <button type="button" className="text-sm text-accent underline" onClick={() => (setSent(false), setCode(""))}>
              {copy.otherAddress}
            </button>
          </form>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <label className="block">
              <span className="text-sm font-semibold">{copy.emailLabel}</span>
              <input className="field mt-1" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className="button-primary w-full" disabled={busy}>
              {copy.sendCode}
            </button>
          </form>
        ))}
      {methods.emailCode && methods.providers.length > 0 && <p className="text-center text-sm text-muted">{copy.or}</p>}
      {methods.providers.map((p) => (
        <button key={p.id} type="button" className="button-secondary w-full" disabled={busy} onClick={() => provider(p.id)}>
          {copy.withProvider(p.label)}
        </button>
      ))}
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
