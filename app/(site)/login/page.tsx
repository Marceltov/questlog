import type { Metadata } from "next";
import { safeNext, signInMethods } from "@/backend";
import { LoginForm } from "@/components/LoginForm";
import { copy } from "@/components/copy";

export const metadata: Metadata = { title: copy.signInTitle };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <div className="column rounded-2xl border-y p-6">
        <h1 className="text-2xl font-bold">{copy.signInTitle}</h1>
        <p className="mt-1 mb-8 text-muted">{copy.signInLead}</p>
        <LoginForm methods={signInMethods()} next={safeNext(next)} />
      </div>
    </main>
  );
}
