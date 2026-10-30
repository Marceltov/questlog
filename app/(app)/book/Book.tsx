import { listPlaythroughs, mcpUrl, type Player, type PlaythroughView } from "@/backend";
import { Pages } from "@/components/Pages";
import { copy } from "@/components/copy";
import { Sheet } from "./Sheet";

// The web app is one book (#12): a contents page, then one page per playthrough, most recently played first, so it opens on the game
// being played now. Every page is rendered here; components/Pages.tsx lays them side by side and turns them. `at` is the playthrough
// whose address was opened (null for the contents); only that page shows hints, and only when the player asked for them on it.
export async function Book({ player, at, reveal = "none" }: { player: Player; at: string | null; reveal?: "none" | "hint" }) {
  const runs = await listPlaythroughs(player);
  const pages = [
    { key: "contents", title: copy.contents, href: "/" },
    ...runs.map((t) => ({ key: t.id, title: `${t.game.title} ${t.label}`, href: t.id === at && reveal === "hint" ? `${t.url}?hints=1` : t.url })),
  ];
  const start = at ? runs.findIndex((t) => t.id === at) + 1 : 0;
  return (
    <Pages pages={pages} start={start} labels={{ previous: copy.previousPage, next: copy.nextPage, pages: copy.pages }}>
      <Contents runs={runs} />
      {runs.map((t) => (
        <Sheet key={t.id} player={player} playthrough={t} reveal={t.id === at ? reveal : "none"} />
      ))}
    </Pages>
  );
}

// The table of contents: every game, and under it its playthroughs with their page numbers. A link turns to the page (data-page), or,
// without JavaScript, opens its address.
function Contents({ runs }: { runs: PlaythroughView[] }) {
  if (!runs.length)
    return (
      <div className="space-y-4">
        <h1 className="plate text-2xl font-bold">{copy.contents}</h1>
        <div className="card space-y-2">
          <p>{copy.nothingYet}</p>
          <p className="text-sm text-muted">{copy.connectHint(mcpUrl())}</p>
        </div>
      </div>
    );
  // Games in the order of their latest playthrough; each game's playthroughs in page order.
  const games = [...new Map(runs.map((t) => [t.game.id, t.game])).values()];
  return (
    <div className="space-y-4">
      <h1 className="plate text-2xl font-bold">{copy.contents}</h1>
      <ol className="card space-y-4">
        {games.map((g) => (
          <li key={g.id}>
            <p className="font-semibold">
              {g.title}
              {g.platform && <span className="font-normal text-muted"> · {g.platform}</span>}
            </p>
            <ol className="mt-1">
              {runs.map((t, i) =>
                t.game.id !== g.id ? null : (
                  <li key={t.id}>
                    <a href={t.url} data-page={i + 1} className="contents-line hover:text-accent">
                      <span>
                        {t.label} · {copy.status[t.status]}
                        <span className="text-sm text-muted"> · {t.lastPlayedOn ? copy.lastPlayed(t.lastPlayedOn) : copy.notPlayedYet}</span>
                      </span>
                      <span className="contents-leader" aria-hidden="true" />
                      <span className="tabular-nums">{i + 1}</span>
                    </a>
                  </li>
                ),
              )}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}
