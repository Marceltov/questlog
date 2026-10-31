import type { Metadata } from "next";
import { headers } from "next/headers";
import { passkeysOf } from "@/backend";
import { Passkeys } from "@/components/Passkeys";
import { serverCopy, serverLocale } from "@/components/copy/server";
import { pagePlayer } from "../viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await serverCopy()).passkeys };
}
export const dynamic = "force-dynamic";

// The player's passkeys (ADR 0015): added here while signed in, used on the sign-in page.
export default async function AccountPage() {
  await pagePlayer();
  const copy = await serverCopy();
  const date = new Intl.DateTimeFormat(await serverLocale(), { dateStyle: "medium" });
  const list = (await passkeysOf(await headers())).map((p) => ({ id: p.id, name: p.name ?? copy.unnamedPasskey, added: date.format(new Date(p.createdAt)) }));
  return (
    <div className="px-4 pt-6 pb-16 lg:px-8">
      <div className="plate max-w-xl">
        <h1 className="text-2xl font-bold">{copy.passkeys}</h1>
        <p className="mt-2 text-muted">{copy.passkeysLead}</p>
        <Passkeys list={list} />
      </div>
    </div>
  );
}
