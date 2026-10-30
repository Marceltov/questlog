import Link from "next/link";
import { listPlaythroughs, mcpUrl } from "@/backend";
import { copy } from "@/components/copy";
import { pagePlayer } from "./viewer";

export const dynamic = "force-dynamic";

export default async function Home() {
  const runs = await listPlaythroughs(await pagePlayer());
  return (
    <>
      <h1 className="plate mb-4 text-2xl font-bold">{copy.homeTitle}</h1>
      {runs.length === 0 ? (
        <div className="card space-y-2">
          <p>{copy.nothingYet}</p>
          <p className="text-sm text-muted">{copy.connectHint(mcpUrl())}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {runs.map((t) => (
            <li key={t.id}>
              <Link href={t.url} className="card block hover:border-accent">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-lg font-semibold">{t.game.title}</span>
                  <span className="text-sm text-muted">
                    {t.label} · {copy.status[t.status]}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  {t.game.platform ? `${t.game.platform} · ` : ""}
                  {t.lastPlayedOn ? copy.lastPlayed(t.lastPlayedOn) : copy.notPlayedYet}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
