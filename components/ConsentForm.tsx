"use client";
// Allow or deny an MCP client. oauthProviderClient sends this page's signed query along, which says what is being consented to.
import { useState } from "react";
import { authClient } from "./auth-client";
import { copy } from "./copy";

export function ConsentForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function answer(accept: boolean) {
    setBusy(true);
    const { data, error } = await authClient.oauth2.consent({ accept });
    if (error || !data?.url) {
      setBusy(false);
      setError(true);
      return;
    }
    window.location.assign(data.url);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <button className="button-primary flex-1" disabled={busy} onClick={() => answer(true)}>
          {copy.allow}
        </button>
        <button className="button-secondary flex-1" disabled={busy} onClick={() => answer(false)}>
          {copy.deny}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-error">
          {copy.consentFailed}
        </p>
      )}
    </div>
  );
}
