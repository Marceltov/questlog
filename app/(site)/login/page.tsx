import type { Metadata } from "next";
import { refusedSignIn, safeNext, signInMethods } from "@/backend";
import { ClosedBook } from "@/components/ClosedBook";
import { copy } from "@/components/copy";

export const metadata: Metadata = { title: copy.signInTitle };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const query = await searchParams;
  return (
    <main>
      <ClosedBook methods={signInMethods()} next={safeNext(query.next)} refused={refusedSignIn(query)} />
    </main>
  );
}
