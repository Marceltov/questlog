import { buildOf, codexOf, itemsOf, listPlaythroughs, mcpUrl, questsOf, sessionsOf, type Player, type PlaythroughView } from "@/backend";
import { Pages } from "@/components/Pages";
import { serverCopy } from "@/components/copy/server";
import { Sheet } from "./Sheet";
import { Tile } from "@/components/icons";
import { Backpack, BookOpen, CalendarDays, Crosshair, Footprints, Gamepad2, ScrollText } from "lucide-react";

// The web app is one book (#12): a contents page, then one page per playthrough, most recently played first, so it opens on the game
// being played now. Every page is rendered here; components/Pages.tsx lays them side by side and turns them. `at` is the playthrough
// whose address was opened (null for the contents). Each page shows as much as its playthrough's spoiler setting (ADR 0016).
export async function Book({ player, at }: { player: Player; at: string | null }) {
  const copy = await serverCopy();
  const runs = await listPlaythroughs(player);
  const pages = [{ key: "contents", title: copy.contents, href: "/" }, ...runs.map((t) => ({ key: t.id, title: `${t.game.title} ${t.label}`, href: t.url }))];
  const start = at ? runs.findIndex((t) => t.id === at) + 1 : 0;
  return (
    <Pages pages={pages} start={start} labels={{ previous: copy.previousPage, next: copy.nextPage, pages: copy.pages }}>
      <Contents player={player} runs={runs} />
      {runs.map((t) => (
        <Sheet key={t.id} player={player} playthrough={t} />
      ))}
    </Pages>
  );
}

// The table of contents: every game, and under it a card for each of its playthroughs that says where the player is, like the page a
// bookmark ribbon hangs from: the last session, the next step, the plan's next goals and how much is filed. The ribbon carries the page
// number. A card turns to its page (data-page), or, without JavaScript, opens its address.
async function Contents({ player, runs }: { player: Player; runs: PlaythroughView[] }) {
  const copy = await serverCopy();
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
    <div className="space-y-6">
      <h1 className="plate text-2xl font-bold">{copy.contents}</h1>
      {games.map((g) => (
        <section key={g.id} aria-labelledby={`game-${g.id}`} className="space-y-2">
          <h2 id={`game-${g.id}`} className="plate flex items-center gap-3">
            <Tile icon={Gamepad2} />
            <span className="text-3xl font-bold tracking-tight">{g.title}</span>
            {g.platform && <span className="self-end pb-1 text-muted">{g.platform}</span>}
          </h2>
          <ol className="space-y-3">{runs.map((t, i) => (t.game.id !== g.id ? null : <RunCard key={t.id} player={player} run={t} page={i + 1} />))}</ol>
        </section>
      ))}
    </div>
  );
}

async function RunCard({ player, run: t, page }: { player: Player; run: PlaythroughView; page: number }) {
  const copy = await serverCopy();
  const [open, build, sessions, items, codex] = await Promise.all([
    questsOf(player, t.id, { statuses: ["open", "blocked"], reveal: t.settings.spoilers }),
    buildOf(player, t.id, 1),
    sessionsOf(player, t.id),
    itemsOf(player, t.id, { reveal: t.settings.spoilers }),
    codexOf(player, t.id, { reveal: t.settings.spoilers }),
  ]);
  const last = sessions[0];
  const next = open.find((q) => q.status === "open" && q.nextStep) ?? open[0];
  const goals = build.goals.filter((g) => g.status === "open" && !g.suggested && g.target !== null && g.current !== null).slice(0, 2);
  const playing = t.status === "playing";
  const counts = [
    { icon: ScrollText, text: copy.questCount(open.length) },
    { icon: Backpack, text: copy.itemCount(items.length) },
    { icon: BookOpen, text: copy.codexCount(codex.length) },
  ];
  return (
    <li>
      <a href={t.url} data-page={page} className={`run-card card block ${playing ? "" : "run-card-closed"}`}>
        <span className={`run-ribbon ${playing ? "" : "run-ribbon-closed"}`}>
          <span className="sr-only">{copy.pageNumber(page)}</span>
          <span aria-hidden="true">{page}</span>
        </span>
        <span className="block pr-10 font-semibold">
          {t.label} · {copy.status[t.status]}
          {t.character?.class && <span className="font-normal text-muted"> · {t.character.class}</span>}
        </span>
        <span className="run-line mt-3">
          <CalendarDays aria-hidden="true" />
          {last ? (
            <span>
              <span className="text-sm text-muted tabular-nums">{copy.lastPlayed(last.playedOn)}</span>
              <span className="block">{last.summary}</span>
            </span>
          ) : (
            <span className="text-sm text-muted">{copy.notPlayedYet}</span>
          )}
        </span>
        {playing && next && (
          <span className="run-line run-next mt-3">
            <Footprints aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold">{next.name}</span>
              <span className="block text-sm">{next.status === "blocked" ? copy.waitingOnGame : next.nextStep}</span>
              {open.length > 1 && <span className="block text-sm text-muted">{copy.moreOpen(open.length - 1)}</span>}
            </span>
          </span>
        )}
        {playing && goals.length > 0 && (
          <span className="run-line mt-3">
            <Crosshair aria-hidden="true" />
            <span className="grid flex-1 gap-3 sm:grid-cols-2">
              {goals.map((goal) => (
                <span key={goal.id} className="block">
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold">{goal.stat ? `${goal.stat.name} ${goal.target}` : copy.level(goal.target!)}</span>
                    <span className="text-muted tabular-nums">{copy.goalProgress(goal.current!, goal.target!)}</span>
                  </span>
                  <span className="goal-track mt-1 block" role="presentation">
                    <span className="goal-fill block" style={{ width: `${Math.min(1, goal.current! / goal.target!) * 100}%` }} />
                  </span>
                </span>
              ))}
            </span>
          </span>
        )}
        <span className="mt-3 block border-t border-dotted border-rule pt-2 text-sm text-muted">
          <span className="flex flex-wrap gap-x-5 gap-y-1">
            {counts.map(({ icon: Icon, text }) => (
              <span key={text} className="inline-flex items-center gap-1.5">
                <Icon aria-hidden="true" className="h-4 w-4" />
                {text}
              </span>
            ))}
          </span>
        </span>
      </a>
    </li>
  );
}
