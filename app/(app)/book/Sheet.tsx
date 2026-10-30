import Link from "next/link";
import { buildOf, itemsOf, questsOf, sessionsOf, type Player, type PlaythroughView, type QuestView } from "@/backend";
import { copy } from "@/components/copy";

// A link's site, for a source without a title.
const siteOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

// One playthrough's page of the book: where the player is, then everything else. Hints show only after the player asks on this page,
// behind a warning (values V1); full spoilers never do here.
export async function Sheet({ player: p, playthrough: t, reveal }: { player: Player; playthrough: PlaythroughView; reveal: "none" | "hint" }) {
  const id = t.id;
  const [threads, all, build, items, sessions] = await Promise.all([
    questsOf(p, id, { statuses: ["open", "blocked"], reveal }),
    questsOf(p, id, { reveal: "none" }),
    buildOf(p, id, 1),
    itemsOf(p, id, { reveal: "none" }),
    sessionsOf(p, id),
  ]);
  const open = [...threads.filter((q) => q.status === "open"), ...threads.filter((q) => q.status === "blocked")];
  const closed = all.filter((q) => q.status !== "open" && q.status !== "blocked");
  const current = build.snapshots[0];
  const last = sessions[0];
  return (
    <div className="space-y-8">
      <div className="plate">
        <h2 className="text-2xl font-bold">{t.game.title}</h2>
        <p className="text-muted">
          {t.label} · {copy.status[t.status]}
          {t.game.platform ? ` · ${t.game.platform}` : ""}
        </p>
        {t.game.sources.length > 0 && (
          <p className="mt-1 text-sm text-muted">
            {copy.sources}:{" "}
            {t.game.sources.map((x, n) => (
              <span key={x.url}>
                {n > 0 && " · "}
                <a href={x.url} className="text-accent" target="_blank" rel="noopener noreferrer">
                  {x.title ?? siteOf(x.url)}
                </a>
              </span>
            ))}
          </p>
        )}
      </div>

      {/* One column on a phone; on a wide screen what is open on the left, the build, items and sessions on the right. */}
      <div className="space-y-8 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-8 lg:space-y-0">
        <div className="space-y-8">
          {last && (
            <section>
              <h3 className="section-title">{copy.lastSession}</h3>
              <Link href={last.url} className="card block hover:border-accent">
                <span className="text-sm text-muted">{last.playedOn}</span>
                <p>{last.summary}</p>
              </Link>
            </section>
          )}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="section-title mb-0">{copy.openQuests}</h3>
              <Link href={reveal === "hint" ? t.url : `${t.url}?hints=1`} className="pill text-sm text-accent">
                {reveal === "hint" ? copy.hideHints : copy.showHints}
              </Link>
            </div>
            {reveal === "hint" && <p className="glass mb-3 rounded-lg border border-hint px-3 py-2 text-sm text-hint">{copy.hintWarning}</p>}
            {open.length === 0 ? <p className="card text-muted">{copy.noOpenQuests}</p> : <Quests quests={open} />}
          </section>
          {closed.length > 0 && (
            <section>
              <h3 className="section-title">{copy.closedQuests}</h3>
              <Quests quests={closed} />
            </section>
          )}
        </div>
        <div className="space-y-8">
          <section>
            <h3 className="section-title">{copy.build}</h3>
            <div className="card space-y-2">
              {build.plan?.mainStat && <p className="font-semibold">{copy.mainStat(build.plan.mainStat)}</p>}
              {build.plan?.summary && <p className="text-muted">{build.plan.summary}</p>}
              {current ? (
                <>
                  <p className="text-sm text-muted">
                    {current.takenOn}
                    {current.level !== null ? ` · ${copy.level(current.level)}` : ""}
                  </p>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-1">
                    {current.stats.map((s) => (
                      <div key={s.key} className="flex justify-between gap-2">
                        <dt>
                          {s.name}
                          {s.localName && <span className="text-sm text-muted"> · {s.localName}</span>}
                        </dt>
                        <dd className="font-semibold tabular-nums">
                          {s.value}
                          {s.change ? <span className="text-accent"> {s.change > 0 ? `+${s.change}` : s.change}</span> : null}
                          {build.plan?.targets[s.key] !== undefined && <span className="text-muted"> / {build.plan.targets[s.key]}</span>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <p className="text-muted">{copy.noBuild}</p>
              )}
            </div>
          </section>
          <section>
            <h3 className="section-title">{copy.items}</h3>
            {items.length === 0 ? (
              <p className="card text-muted">{copy.noItems}</p>
            ) : (
              <ul className="space-y-2">
                {items.map((i) => (
                  <li key={i.id} id={`item-${i.id}`} className="card">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold">
                        {i.name}
                        {i.localName && <span className="font-normal text-muted"> · {i.localName}</span>}
                      </span>
                      {i.equipped && <span className="text-xs font-bold text-accent uppercase">{copy.equipped}</span>}
                    </div>
                    {(i.kind || i.location) && <p className="text-sm text-muted">{[i.kind, i.location].filter(Boolean).join(" · ")}</p>}
                    {i.verdict && <p className="mt-1 text-sm">{i.verdict}</p>}
                    {i.sources.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-sm text-muted">
                        {i.sources.map((x) => (
                          <li key={x.url}>
                            {x.facts && <span>{x.facts} · </span>}
                            <a href={x.url} className="text-accent" target="_blank" rel="noopener noreferrer">
                              {x.title ?? siteOf(x.url)}
                            </a>
                            {x.on && <span className="tabular-nums"> · {x.on}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {sessions.length > 0 && (
            <section>
              <h3 className="section-title">{copy.sessions}</h3>
              <ul className="card divide-y divide-rule py-1">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <Link href={s.url} className="flex gap-3 py-2 hover:text-accent">
                      <span className="shrink-0 text-sm text-muted tabular-nums">{s.playedOn}</span>
                      <span>{s.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Quests({ quests }: { quests: QuestView[] }) {
  return (
    <ul className="space-y-2">
      {quests.map((q) => (
        <li key={q.id} id={`quest-${q.id}`} className="card">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold">
              {q.name}
              {q.localName && <span className="font-normal text-muted"> · {q.localName}</span>}
            </span>
            <span className="text-xs font-bold text-muted uppercase">{q.status === "blocked" ? copy.waitingOnGame : copy.questStatus[q.status]}</span>
          </div>
          {(q.giver || q.location) && <p className="text-sm text-muted">{[q.giver, q.location].filter(Boolean).join(" · ")}</p>}
          {q.entries.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {q.entries.map((e) => (
                <li key={e.id} className={e.spoiler === "none" ? "" : "text-hint"}>
                  {e.on && <span className="text-muted tabular-nums">{e.on} </span>}
                  {e.spoiler !== "none" && <span className="font-bold">{copy.spoilerTag[e.spoiler]}: </span>}
                  {copy.entryKind[e.kind]}
                  {e.text}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
