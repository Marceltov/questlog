import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { copy } from "@/components/copy";
import { pagePlayer } from "./viewer";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await pagePlayer();
  return (
    <div className="column mx-auto min-h-dvh max-w-2xl px-4 pb-16 lg:max-w-6xl lg:px-8">
      <header className="glass sticky top-0 z-10 -mx-4 flex items-center justify-between border-b border-rule px-4 py-3 lg:-mx-8 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element -- the app's own icon, no optimizer */}
          <img src="/icon.svg" alt="" width={24} height={24} />
          {copy.appName}
        </Link>
        <SignOutButton />
      </header>
      <main className="pt-6">{children}</main>
    </div>
  );
}
