import Link from "next/link";
import { briefing, buildOf, itemsOf, questsOf, sessionsOf, type QuestView } from "@/backend";
import { copy } from "@/components/copy";
import { orNotFound, pagePlayer } from "../../viewer";

export const dynamic = "force-dynamic";

// A playthrough: where the player is, then everything else. Hints show only after the player asks on this page, behind a warning
// (values V1); full spoilers never do here.
export default async function PlaythroughPage({ params, searchParams }: PageProps<"/p/[id]">) {
  const p = await pagePlayer();
  const { id } = await params;
  const reveal = (await searchParams).hints === "1" ? "hint" : "none";
  const b = await orNotFound(briefing(p, { playthroughId: id }));
  const t = b.playthrough!;
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
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t.game.title}</h1>
        <p className="text-muted">
          {t.label} · {copy.status[t.status]}
          {t.game.platform ? ` · ${t.game.platform}` : ""}
        </p>
      </div>

      {b.lastSession && (
        <section>
          <h2 className="section-title">{copy.lastSession}</h2>
          <Link href={b.lastSession.url} className="card block hover:border-accent">
            <span className="text-sm text-muted">{b.lastSession.playedOn}</span>
            <p>{b.lastSession.summary}</p>
          </Link>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="section-title mb-0">{copy.openQuests}</h2>
          <Link href={reveal === "hint" ? `/p/${id}` : `/p/${id}?hints=1`} className="text-sm text-accent">
            {reveal === "hint" ? copy.hideHints : copy.showHints}
          </Link>
        </div>
        {reveal === "hint" && <p className="mb-3 rounded-lg border border-hint px-3 py-2 text-sm text-hint">{copy.hintWarning}</p>}
        {open.length === 0 ? <p className="text-muted">{copy.noOpenQuests}</p> : <Quests quests={open} />}
      </section>

      <section>
        <h2 className="section-title">{copy.build}</h2>
        <div className="card space-y-2">
          {build.plan?.mainStat && <p className="font-semibold">{copy.mainStat(build.plan.mainStat)}</p>}
          {build.plan?.summary && <p className="text-muted">{build.plan.summary}</p>}
          {current ? (
            <>
              <p className="text-sm text-muted">
                {current.takenOn}
                {current.level !== null ? ` · ${copy.level(current.level)}` : ""}
              </p>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
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
        <h2 className="section-title">{copy.items}</h2>
        {items.length === 0 ? (
          <p className="text-muted">{copy.noItems}</p>
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
              </li>
            ))}
          </ul>
        )}
      </section>

      {closed.length > 0 && (
        <section>
          <h2 className="section-title">{copy.closedQuests}</h2>
          <Quests quests={closed} />
        </section>
      )}

      {sessions.length > 0 && (
        <section>
          <h2 className="section-title">{copy.sessions}</h2>
          <ul className="divide-y divide-rule">
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
