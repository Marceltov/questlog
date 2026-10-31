"use client";
// The account page's passkeys: the list, adding one (the browser asks the device or password manager), and removing one.
import { KeyRound, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "./auth-client";
import { useCopy } from "./copy/client";

export function Passkeys({ list }: { list: { id: string; name: string; added: string }[] }) {
  const copy = useCopy();
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.passkey.addPasskey({ name: name.trim() || undefined });
    setBusy(false);
    if (error) return setError(copy.addPasskeyFailed);
    setName("");
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    await authClient.passkey.deletePasskey({ id });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-6">
      {list.length ? (
        <ul className="divide-y divide-rule rounded-xl border border-rule">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <KeyRound aria-hidden="true" className="size-5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.name}</p>
                <p className="text-sm text-muted">{copy.passkeyAdded(p.added)}</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-muted hover:text-error"
                disabled={busy}
                onClick={() => remove(p.id)}
                aria-label={copy.removePasskey(p.name)}
              >
                <Trash2 aria-hidden="true" className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{copy.noPasskeys}</p>
      )}
      <form onSubmit={add} className="space-y-3">
        <label className="block">
          <span className="text-sm font-semibold">{copy.passkeyName}</span>
          <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder={copy.passkeyNameHint} maxLength={60} />
        </label>
        <button className="button-primary w-full" disabled={busy}>
          {copy.addPasskey}
        </button>
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
