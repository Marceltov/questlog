import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { copy } from "@/components/copy";
import { pagePlayer } from "./viewer";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await pagePlayer();
  return (
    // The window doesn't scroll: the header stays, and what is under it scrolls on its own (each page of the book, or a session).
    <div className="column mx-auto flex h-dvh max-w-2xl flex-col lg:max-w-6xl">
      <header className="glass z-10 flex shrink-0 items-center justify-between border-b border-rule px-4 py-3 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element -- the app's own icon, no optimizer */}
          <img src="/icon.svg" alt="" width={24} height={24} />
          {copy.appName}
        </Link>
        <SignOutButton />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
