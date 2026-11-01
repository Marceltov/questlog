// The tables, as Kysely sees them. Times are milliseconds since the epoch, days are YYYY-MM-DD text, booleans 0/1 integers and lists
// JSON text. Every table carries the `player_id` it belongs to (Better Auth's user id, values V2), so the gate in spoilers.ts scopes
// each one without a join.
import type { ColumnType } from "kysely";

type Flag = ColumnType<number, number | undefined, number>;
type Json = ColumnType<string, string | undefined, string>;
/** Text with a default in the table: optional on insert. */
type Defaulted = ColumnType<string, string | undefined, string>;

export interface Schema {
  games: {
    id: string;
    player_id: string;
    title: string;
    norm: string;
    platform: string | null;
    stats: Json;
    item_kinds: Json;
    sources: Json;
    created_at: number;
    description: string | null;
    notes: string | null;
  };
  playthroughs: {
    id: string;
    player_id: string;
    game_id: string;
    label: string;
    language: string | null;
    status: string;
    last_played_on: string | null;
    character_name: string | null;
    character_class: string | null;
    character_local_class: string | null;
    created_at: number;
    notes: string | null;
    background: Defaulted;
    spoilers: Defaulted;
  };
  sessions: {
    id: string;
    player_id: string;
    playthrough_id: string;
    played_on: string;
    summary: string;
    transcript: string;
    created_at: number;
    notes: string | null;
  };
  quests: {
    id: string;
    player_id: string;
    playthrough_id: string;
    name: string;
    norm: string;
    local_name: string | null;
    giver: string | null;
    location: string | null;
    status: string;
    spoiler: string;
    session_id: string | null;
    created_at: number;
    updated_at: number;
    description: string | null;
    notes: string | null;
  };
  quest_entries: {
    id: string;
    player_id: string;
    quest_id: string;
    session_id: string | null;
    kind: string;
    text: string;
    spoiler: string;
    created_at: number;
  };
  build_plans: { playthrough_id: string; player_id: string; summary: string | null; main_stat: string | null; targets: Json; updated_at: number };
  goals: {
    id: string;
    player_id: string;
    playthrough_id: string;
    session_id: string | null;
    kind: string;
    stat: string | null;
    target: number | null;
    item_id: string | null;
    text: string | null;
    rank: number;
    status: string;
    suggested: Flag;
    spoiler: string;
    reached_on: string | null;
    created_at: number;
    updated_at: number;
    notes: string | null;
  };
  stat_snapshots: {
    id: string;
    player_id: string;
    playthrough_id: string;
    session_id: string | null;
    taken_on: string;
    level: number | null;
    stats: Json;
    created_at: number;
    notes: string | null;
  };
  items: {
    id: string;
    player_id: string;
    playthrough_id: string;
    session_id: string | null;
    name: string;
    norm: string;
    local_name: string | null;
    kind: string | null;
    location: string | null;
    equipped: Flag;
    verdict: string | null;
    spoiler: string;
    sources: Json;
    quantity: number | null;
    attributes: Json;
    created_at: number;
    updated_at: number;
    description: string | null;
    notes: string | null;
  };
  codex: {
    id: string;
    player_id: string;
    playthrough_id: string;
    session_id: string | null;
    kind: string;
    name: string;
    norm: string;
    local_name: string | null;
    location: string | null;
    status: string;
    attempts: number | null;
    beaten_on: string | null;
    weaknesses: Json;
    resistances: Json;
    strategy: string | null;
    notes: string | null;
    spoiler: string;
    sources: Json;
    created_at: number;
    updated_at: number;
    description: string | null;
  };
  /** Messages a player sent to the in-app chat on a day, against GAMEPANION_CHAT_DAILY_LIMIT (ADR 0013). */
  chat_usage: { player_id: string; day: string; count: number };
  /** A game's tags (ADR 0014): one per name, `norm` unique within the game. */
  tags: { id: string; player_id: string; game_id: string; name: string; norm: string; created_at: number };
  /** Which item, codex entry or quest carries a tag. */
  tag_links: { tag_id: string; player_id: string; what: string; row_id: string };
  background: {
    id: string;
    player_id: string;
    what: string;
    row_id: string;
    text: string;
    spoiler: string;
    source_url: string | null;
    source_title: string | null;
    created_at: number;
  };
  item_uses: { item_id: string; codex_id: string; player_id: string; effect: string; note: string | null; created_at: number };
}
