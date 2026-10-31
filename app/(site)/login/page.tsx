import type { Metadata } from "next";
import { refusedSignIn, safeNext, signInMethods } from "@/backend";
import { ClosedBook } from "@/components/ClosedBook";
import { serverCopy } from "@/components/copy/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await serverCopy()).signInTitle };
}
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const query = await searchParams;
  return (
    <main>
      <ClosedBook methods={signInMethods()} next={safeNext(query.next)} refused={refusedSignIn(query)} />
    </main>
  );
}
