"use client";
// The sign-in: an email code, a passkey, or an OpenID Connect provider. When an MCP client sent the player here (the URL carries Better
// Auth's signed authorize query, which oauthProviderClient sends along), a sign-in continues that authorization instead of opening the app.
// A passkey is offered where the browser has them: as a button, and in the address field's autofill.
import { useEffect, useState, useSyncExternalStore } from "react";
import type { RefusedSignIn } from "@/backend";
import { authClient } from "./auth-client";
import { useCopy } from "./copy/client";

type Methods = { emailCode: boolean; providers: { id: string; label: string }[] };

// Whether this browser has passkeys; never on the server, which can't know.
const hasPasskeys = () => typeof window.PublicKeyCredential === "function";
const noChange = () => () => {};

// Where a finished sign-in goes: Better Auth's next step of the authorization, or the page the player wanted.
function go(data: unknown, next: string) {
  const url = typeof data === "object" && data && "url" in data && typeof data.url === "string" ? data.url : null;
  window.location.assign(url ?? next);
}

/**
 * `onSignedIn` runs once a sign-in has succeeded, before the browser moves on: the closed book opens there. `refused`: a provider turned
 * the last sign-in down, and says why.
 */
export function LoginForm({
  methods,
  next,
  onSignedIn,
  refused,
}: {
  methods: Methods;
  next: string;
  onSignedIn?: (email: string) => Promise<void>;
  refused?: RefusedSignIn | null;
}) {
  const copy = useCopy();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(refused ? copy.refused(refused.provider, refused.code) : null);
  const passkeys = useSyncExternalStore(noChange, hasPasskeys, () => false);

  // The address field offers the browser's passkeys for this site in its autofill.
  useEffect(() => {
    if (!hasPasskeys()) return;
    void window.PublicKeyCredential.isConditionalMediationAvailable?.().then(async (yes) => {
      if (!yes) return;
      const { data, error } = await authClient.signIn.passkey({ autoFill: true });
      if (!error && data) await signedIn(data, data.user.email);
    });
    // Once per page: the autofill request waits until the player picks a passkey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signedIn(data: unknown, who: string) {
    await onSignedIn?.(who);
    go(data, next);
  }

  async function passkey() {
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.signIn.passkey();
    if (error || !data) {
      setBusy(false);
      setError(copy.passkeyFailed);
      return;
    }
    await signedIn(data, data.user.email);
  }

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
    await signedIn(data, email);
  }

  // genericOAuth registers each provider as a social one; Better Auth carries an MCP client's authorize query through it by itself.
  async function provider(id: string) {
    setBusy(true);
    // Better Auth adds the provider's `error` to this URL; the page shows it (#17).
    const back = `/login?${new URLSearchParams({ provider: id, next })}`;
    const { data, error } = await authClient.signIn.social({ provider: id, callbackURL: next, errorCallbackURL: back });
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
              <input className="field mt-1" type="email" autoComplete="email webauthn" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className="button-primary w-full" disabled={busy}>
              {copy.sendCode}
            </button>
          </form>
        ))}
      {methods.emailCode && (passkeys || methods.providers.length > 0) && <p className="text-center text-sm text-muted">{copy.or}</p>}
      {passkeys && (
        <button type="button" className="button-secondary w-full" disabled={busy} onClick={passkey}>
          {copy.withPasskey}
        </button>
      )}
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
