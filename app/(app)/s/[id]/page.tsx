import Link from "next/link";
import { getSession } from "@/backend";
import { copy } from "@/components/copy";
import { orNotFound, pagePlayer } from "../../viewer";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: PageProps<"/s/[id]">) {
  const s = await orNotFound(getSession(await pagePlayer(), (await params).id));
  return (
    <div className="px-4 pt-6 pb-16 lg:px-8">
      <div className="plate">
        <Link href={s.playthrough.url} className="text-sm text-accent">
          ← {s.playthrough.game.title} {s.playthrough.label}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{s.playedOn}</h1>
        <p className="mt-1 text-muted">{s.summary}</p>
      </div>
      <h2 className="section-title mt-6 block w-fit">{copy.transcript}</h2>
      <blockquote className="card whitespace-pre-wrap">{s.transcript}</blockquote>
    </div>
  );
}
