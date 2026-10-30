import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientName, signedInAs } from "@/backend";
import { ConsentForm } from "@/components/ConsentForm";
import { copy } from "@/components/copy";

export const metadata: Metadata = { title: copy.consentTitle };
export const dynamic = "force-dynamic";

// Better Auth sends the player here, signed in, with the client and its scopes in a signed query; ConsentForm answers it.
export default async function ConsentPage({ searchParams }: PageProps<"/consent">) {
  const h = await headers();
  const who = await signedInAs(h);
  if (!who) redirect("/login");
  const { client_id } = await searchParams;
  const name = (typeof client_id === "string" && (await clientName(h, client_id))) || copy.unknownClient;
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <div className="card rounded-2xl p-6">
        <h1 className="text-2xl font-bold">{copy.consentTitle}</h1>
        <p className="mt-3">{copy.consentLead(name)}</p>
        <p className="mt-2 mb-8 text-sm text-muted">{copy.consentWho(who)}</p>
        <ConsentForm />
      </div>
    </main>
  );
}
