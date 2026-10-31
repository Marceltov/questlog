"use client";
import { useRouter } from "next/navigation";
import { authClient } from "./auth-client";
import { useCopy } from "./copy/client";

export function SignOutButton() {
  const copy = useCopy();
  const router = useRouter();
  return (
    <button className="text-sm text-muted hover:text-accent" onClick={async () => (await authClient.signOut(), router.push("/login"))}>
      {copy.signOut}
    </button>
  );
}
