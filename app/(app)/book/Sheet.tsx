import Link from "next/link";
import {
  buildOf,
  CODEX_KINDS,
  EFFECTS,
  codexOf,
  itemsOf,
  questsOf,
  sessionsOf,
  type CodexView,
  type ItemView,
  type Player,
  type PlaythroughView,
  type QuestView,
} from "@/backend";
import { serverCopy } from "@/components/copy/server";
import { Notes } from "@/components/Notes";
import { Register } from "@/components/Register";
import { TalkAbout } from "@/components/chat/Chat";
import { CODEX_ICONS, Heading, itemIcon, PART_ICONS, QUEST_ICONS, Tile } from "@/components/icons";
import { CalendarDays, Crosshair, Footprints, Sparkles, Sword } from "lucide-react";

// A link's site, for a source without a title.
const siteOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

// One playthrough's page of the book: its title, then the register (components/Register.tsx), where the player left off first. Hints show only after the player asks on this page,
// behind a warning (values V1); full spoilers never do here.
export async function Sheet({ player: p, playthrough: t, reveal }: { player: Player; playthrough: PlaythroughView; reveal: "none" | "hint" }) {
  const copy = await serverCopy();
  const id = t.id;
  const [threads, all, build, items, sessions, codex] = await Promise.all([
    questsOf(p, id, { statuses: ["open", "blocked"], reveal }),
    questsOf(p, id, { reveal: "none" }),
    buildOf(p, id, 1),
    itemsOf(p, id, { reveal: "none" }),
    sessionsOf(p, id),
    codexOf(p, id, { reveal: "none" }),
  ]);
  // The inventory by the game's groups, in the player's order, under the game's own name when it has one; an item without one goes last.
  const kinds = t.game.itemKinds;
  const known = (k: string | null) => kinds.some((x) => x.key === k);
  const groups: [string, string | null, ItemView[]][] = [
    ...kinds.map((k): [string, string | null, ItemView[]] => [k.localName ?? k.name, k.key, items.filter((i) => i.kind === k.key)]),
    [copy.otherItems, null, items.filter((i) => !known(i.kind))] as [string, string | null, ItemView[]],
  ].filter(([, , list]) => list.length > 0);
  const open = [...threads.filter((q) => q.status === "open"), ...threads.filter((q) => q.status === "blocked")];
  const closed = all.filter((q) => q.status !== "open" && q.status !== "blocked");
  const current = build.snapshots[0];
  const last = sessions[0];
  const tabs = (["overview", "character", "quests", "items", "codex", "sessions", "notes"] as const).map((key) => {
    const Icon = PART_ICONS[key];
    return { key, label: copy.tabs[key], icon: <Icon aria-hidden="true" /> };
  });
  const equipped = items.filter((i) => i.equipped);
  const hasNotes = t.game.description || t.game.notes || t.notes || t.game.sources.length > 0;
  return (
    <div className="space-y-4">
      <div className="plate">
        <h2 className="text-2xl font-bold">{t.game.title}</h2>
        <p className="text-muted">
          {t.label} · {copy.status[t.status]}
          {t.game.platform ? ` · ${t.game.platform}` : ""}
        </p>
        {t.character && (
          <p className="mt-1">
            {[t.character.name, t.character.class].filter(Boolean).join(", ")}
            {t.character.localClass && <span className="text-sm text-muted"> · {t.character.localClass}</span>}
          </p>
        )}
      </div>

      {/* The rest behind the register's tabs; hints open on the quests, where they are. */}
      <Register tabs={tabs} start={reveal === "hint" ? "quests" : "overview"} label={copy.tabs.label}>
        {/* Where the player left off: the last session, what each open quest waits for, the plan's next goals and what is equipped. */}
        <div className="space-y-6">
          {last && (
            <section>
              <Heading icon={CalendarDays}>{copy.lastSession}</Heading>
              <SessionCard session={last} />
            </section>
          )}
          <section>
            <Heading icon={Footprints}>{copy.nextSteps}</Heading>
            {open.length === 0 ? (
              <p className="card text-muted">{copy.noOpenQuests}</p>
            ) : (
              <ul className="card divide-y divide-rule py-1">
                {open.map((q) => (
                  <li key={q.id}>
                    <a href={`#quest-${q.id}`} className="flex items-center gap-3 py-2 hover:text-accent">
                      <Tile icon={QUEST_ICONS[q.status]} muted={q.status === "blocked"} />
                      <span className="min-w-0">
                        <span className="font-semibold">{q.name}</span>
                        {q.status === "blocked" ? (
                          <span className="block text-sm text-muted">{copy.waitingOnGame}</span>
                        ) : (
                          q.nextStep && <span className="block text-sm">{q.nextStep}</span>
                        )}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {build.goals.some((g) => g.status === "open") && (
            <section>
              <Heading icon={Crosshair}>{copy.goals}</Heading>
              <Goals goals={build.goals.filter((g) => g.status === "open")} run={t.id} />
            </section>
          )}
          {equipped.length > 0 && (
            <section>
              <Heading icon={Sword}>{copy.equipped}</Heading>
              <ul className="card divide-y divide-rule py-1">
                {equipped.map((i) => (
                  <li key={i.id}>
                    <a href={`#item-${i.id}`} className="flex items-center gap-3 py-2 hover:text-accent">
                      <Tile icon={itemIcon(i.kind)} />
                      <span className="flex-1 font-semibold">
                        {i.name}
                        {i.localName && <span className="font-normal text-muted"> · {i.localName}</span>}
                      </span>
                      {i.quantity !== null && <span className="tabular-nums">{copy.quantity(i.quantity)}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
          <section>
            <Heading icon={Crosshair}>{copy.goals}</Heading>
            {build.goals.length === 0 ? <p className="card text-muted">{copy.noGoals}</p> : <Goals goals={build.goals} run={t.id} />}
          </section>
          <section>
            <Heading icon={Sparkles}>{copy.build}</Heading>
            <div className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                {build.plan?.mainStat ? <p className="font-semibold">{copy.mainStat(build.plan.mainStat)}</p> : <span />}
                {current && <TalkAbout kind="stats" id={current.id} name={copy.build} playthroughId={t.id} />}
              </div>
              {build.plan?.summary && <p className="text-muted">{build.plan.summary}</p>}
              {current ? (
                <>
                  <p className="text-sm text-muted">
                    {current.takenOn}
                    {current.level !== null ? ` · ${copy.level(current.level)}` : ""}
                  </p>
                  <Notes notes={current.notes} />
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
        </div>

        <div className="space-y-6">
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <Heading icon={QUEST_ICONS.open} className="mb-0">
                {copy.openQuests}
              </Heading>
              <Link href={reveal === "hint" ? t.url : `${t.url}?hints=1`} className="pill text-sm text-accent">
                {reveal === "hint" ? copy.hideHints : copy.showHints}
              </Link>
            </div>
            {reveal === "hint" && <p className="glass mb-3 rounded-lg border border-hint px-3 py-2 text-sm text-hint">{copy.hintWarning}</p>}
            {open.length === 0 ? <p className="card text-muted">{copy.noOpenQuests}</p> : <Quests quests={open} run={t.id} />}
          </section>
          {closed.length > 0 && (
            <section>
              <Heading icon={QUEST_ICONS.done}>{copy.closedQuests}</Heading>
              <Quests quests={closed} run={t.id} />
            </section>
          )}
        </div>

        {/* The inventory in the game's groups; on a wide screen two columns of cards. */}
        {items.length === 0 ? (
          <p className="card text-muted">{copy.noItems}</p>
        ) : (
          <div className="space-y-6">
            {groups.map(([label, key, list]) => (
              <div key={label}>
                <Heading icon={itemIcon(key)}>{label}</Heading>
                <ul className="grid gap-2 lg:grid-cols-2">
                  {list.map((i) => (
                    <Item key={i.id} item={i} run={t.id} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {codex.length === 0 ? (
          <p className="card text-muted">{copy.noCodex}</p>
        ) : (
          <div className="space-y-6">
            {CODEX_KINDS.map((k) => {
              const entries = codex.filter((e) => e.kind === k);
              return entries.length === 0 ? null : (
                <div key={k}>
                  <Heading icon={CODEX_ICONS[k]}>{copy.codexKinds[k]}</Heading>
                  <ul className="grid gap-2 lg:grid-cols-2">
                    {entries.map((e) => (
                      <CodexEntry key={e.id} entry={e} run={t.id} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {sessions.length === 0 ? (
          <p className="card text-muted">{copy.noSessions}</p>
        ) : (
          <ul className="card divide-y divide-rule py-1">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <Link href={s.url} className="flex flex-1 gap-3 py-2 hover:text-accent">
                  <span className="shrink-0 text-sm text-muted tabular-nums">{s.playedOn}</span>
                  <span>{s.summary}</span>
                </Link>
                <TalkAbout kind="session" id={s.id} name={s.playedOn} playthroughId={t.id} />
              </li>
            ))}
          </ul>
        )}

        {/* What the game is, the player's own notes on it and on this run, and the sites they trust for it. */}
        {!hasNotes ? (
          <p className="card text-muted">{copy.noNotes}</p>
        ) : (
          <div className="card space-y-3">
            {(t.game.description || t.game.notes) && (
              <div>
                <h4 className="font-semibold">{t.game.title}</h4>
                <Notes description={t.game.description} notes={t.game.notes} />
              </div>
            )}
            {t.notes && (
              <div>
                <h4 className="font-semibold">{t.label}</h4>
                <Notes notes={t.notes} />
              </div>
            )}
            {t.game.sources.length > 0 && (
              <div>
                <h4 className="font-semibold">{copy.sources}</h4>
                <ul className="mt-1 space-y-2 text-sm">
                  {t.game.sources.map((x) => (
                    <li key={x.url}>
                      <a href={x.url} className="text-accent" target="_blank" rel="noopener noreferrer">
                        {x.title ?? siteOf(x.url)}
                      </a>
                      {x.facts && <p className="text-muted">{x.facts}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Register>
    </div>
  );
}

async function SessionCard({ session: s }: { session: { url: string; playedOn: string; summary: string; notes: string | null } }) {
  return (
    <Link href={s.url} className="card block hover:border-accent">
      <span className="text-sm text-muted">{s.playedOn}</span>
      <p>{s.summary}</p>
      <Notes notes={s.notes} />
    </Link>
  );
}

// The plan is a sequence: the goals in their order, then what was reached, quieter.
async function Goals({ goals, run }: { goals: Awaited<ReturnType<typeof buildOf>>["goals"]; run: string }) {
  const copy = await serverCopy();
  return (
    <ol className="card space-y-3">
      {goals.map((g) => {
        const measured = g.target !== null && g.current !== null;
        const share = measured ? Math.min(1, g.current! / g.target!) : g.status === "reached" ? 1 : 0;
        return (
          <li key={g.id} className={`goal ${g.status === "reached" ? "goal-reached" : ""} ${g.suggested ? "goal-suggested" : ""}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">
                {g.kind === "stat" && g.stat ? (
                  <>
                    {g.stat.name} {g.target}
                    {g.stat.localName && <span className="text-sm font-normal text-muted"> · {g.stat.localName}</span>}
                  </>
                ) : g.kind === "level" ? (
                  copy.level(g.target ?? 0)
                ) : g.item ? (
                  <a href={g.item.url} className="text-accent">
                    {g.item.name}
                  </a>
                ) : (
                  g.text
                )}
              </span>
              <span className="shrink-0 text-sm text-muted tabular-nums">
                {g.status === "reached" && g.reachedOn
                  ? copy.reachedOn(g.reachedOn)
                  : g.suggested
                    ? copy.suggested
                    : measured
                      ? copy.goalProgress(g.current!, g.target!)
                      : ""}
              </span>
              <TalkAbout
                kind="goal"
                id={g.id}
                name={g.stat ? `${g.stat.name} ${g.target}` : (g.item?.name ?? g.text ?? copy.goals)}
                playthroughId={run}
                small
              />
            </div>
            {g.kind !== "note" && g.text && <p className="text-sm text-muted">{g.text}</p>}
            <Notes notes={g.notes} />
            {(measured || g.status === "reached") && (
              <div className="goal-track" role="presentation">
                <div className="goal-fill" style={{ width: `${share * 100}%` }} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

async function Quests({ quests, run }: { quests: QuestView[]; run: string }) {
  const copy = await serverCopy();
  return (
    <ul className="space-y-2">
      {quests.map((q) => (
        <li key={q.id} id={`quest-${q.id}`} className="card">
          <div className="card-head">
            <Tile icon={QUEST_ICONS[q.status]} muted={q.status !== "open"} />
            <span className="flex-1 font-semibold">
              {q.name}
              {q.localName && <span className="font-normal text-muted"> · {q.localName}</span>}
            </span>
            <span className="shrink-0 text-sm text-muted">{q.status === "blocked" ? copy.waitingOnGame : copy.questStatus[q.status]}</span>
            <TalkAbout kind="quest" id={q.id} name={q.name} playthroughId={run} />
          </div>
          {(q.giver || q.location) && <p className="text-sm text-muted">{[q.giver, q.location].filter(Boolean).join(" · ")}</p>}
          <Notes description={q.description} notes={q.notes} />
          {q.entries.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {q.entries.map((e) => (
                <li key={e.id} className={e.spoiler === "none" ? "" : "text-hint"}>
                  {e.on && <span className="text-muted tabular-nums">{e.on} </span>}
                  {e.spoiler !== "none" && <span className="font-bold">{copy.spoilerTag[e.spoiler]}: </span>}
                  {copy.entryKind[e.kind]}
                  {e.text} <TalkAbout kind="entry" id={e.id} name={`${q.name}, ${e.on ?? ""}`.replace(/, $/, "")} playthroughId={run} small />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

// One thing in the inventory: its count, its numbers as the game shows them, and what it is good against.
async function Item({ item: i, run }: { item: ItemView; run: string }) {
  const copy = await serverCopy();
  const numbers = Object.entries(i.attributes);
  return (
    <li id={`item-${i.id}`} className="card">
      <div className="card-head">
        <Tile icon={itemIcon(i.kind)} />
        <span className="flex-1 font-semibold">
          {i.name}
          {i.localName && <span className="font-normal text-muted"> · {i.localName}</span>}
        </span>
        <span className="flex shrink-0 items-baseline gap-2">
          {i.quantity !== null && <span className="font-semibold tabular-nums">{copy.quantity(i.quantity)}</span>}
          {i.equipped && <span className="text-sm font-semibold text-accent">{copy.equipped}</span>}
        </span>
        <TalkAbout kind="item" id={i.id} name={i.name} playthroughId={run} />
      </div>
      {i.location && <p className="text-sm text-muted">{i.location}</p>}
      {numbers.length > 0 && (
        <dl className="numbers">
          {numbers.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {EFFECTS.map((effect) => {
        const list = i.against.filter((a) => a.effect === effect);
        return (
          list.length > 0 && (
            <p key={effect} className="mt-1 text-sm">
              <span className="text-muted">{copy.against[effect]}: </span>
              {list.map((a, n) => (
                <span key={a.codex.id}>
                  {n > 0 && ", "}
                  <a href={a.codex.url} className="text-accent">
                    {a.codex.name}
                  </a>
                  {a.note && <span className="text-muted"> ({a.note})</span>}
                </span>
              ))}
            </p>
          )
        );
      })}
      <Notes description={i.description} />
      {i.verdict && <p className="mt-1 text-sm">{i.verdict}</p>}
      <Notes notes={i.notes} />
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
  );
}

// A boss, enemy, NPC or place: what is still in the way stands out, what is beaten or gone is quieter.
async function CodexEntry({ entry: e, run }: { entry: CodexView; run: string }) {
  const copy = await serverCopy();
  const state =
    e.status === "beaten" ? (e.beatenOn ? copy.beatenOn(e.beatenOn) : null) : e.status === "gone" ? copy.gone : e.attempts ? copy.tries(e.attempts) : null;
  return (
    <li id={`codex-${e.id}`} className={`card ${e.status === "met" ? "" : "opacity-70"}`}>
      <div className="card-head">
        <Tile icon={CODEX_ICONS[e.kind]} muted={e.status !== "met"} />
        <span className="flex-1 font-semibold">
          {e.name}
          {e.localName && <span className="font-normal text-muted"> · {e.localName}</span>}
        </span>
        {state && <span className={`shrink-0 text-sm tabular-nums ${e.status === "met" ? "text-accent" : "text-muted"}`}>{state}</span>}
        <TalkAbout kind="codex" id={e.id} name={e.name} playthroughId={run} />
      </div>
      {e.location && <p className="text-sm text-muted">{e.location}</p>}
      {(e.weaknesses.length > 0 || e.resistances.length > 0) && (
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {e.weaknesses.length > 0 && (
            <span>
              <span className="text-muted">{copy.weakTo}: </span>
              {e.weaknesses.join(", ")}
            </span>
          )}
          {e.resistances.length > 0 && (
            <span>
              <span className="text-muted">{copy.resists}: </span>
              {e.resistances.join(", ")}
            </span>
          )}
        </p>
      )}
      <Notes description={e.description} />
      {e.strategy && <p className="mt-1 text-sm">{e.strategy}</p>}
      <Notes notes={e.notes} />
      {EFFECTS.map((effect) => {
        const list = e.counters.filter((c) => c.effect === effect);
        return (
          list.length > 0 && (
            <p key={effect} className="mt-1 text-sm">
              <span className="text-muted">{copy.counters[effect]}: </span>
              {list.map((c, n) => (
                <span key={c.item.id}>
                  {n > 0 && ", "}
                  <a href={c.item.url} className="text-accent">
                    {c.item.name}
                  </a>
                  {c.item.quantity !== null && <span className="tabular-nums"> {copy.quantity(c.item.quantity)}</span>}
                  {c.note && <span className="text-muted"> ({c.note})</span>}
                </span>
              ))}
            </p>
          )
        );
      })}
      {e.sources.length > 0 && (
        <p className="mt-1 text-sm text-muted">
          {e.sources.map((x, n) => (
            <span key={x.url}>
              {n > 0 && " · "}
              <a href={x.url} className="text-accent" target="_blank" rel="noopener noreferrer">
                {x.title ?? siteOf(x.url)}
              </a>
            </span>
          ))}
        </p>
      )}
    </li>
  );
}
