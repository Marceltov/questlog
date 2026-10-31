import Link from "next/link";
import { Follow } from "@/components/Follow";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { SignOutButton } from "@/components/SignOutButton";
import { serverCopy } from "@/components/copy/server";
import { pagePlayer } from "./viewer";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const copy = await serverCopy();
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
        <div className="flex items-center gap-3">
          <LanguageSwitch />
          <SignOutButton />
        </div>
      </header>
      <Follow>{children}</Follow>
    </div>
  );
}
