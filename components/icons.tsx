// The pictures of the book (lucide): one per part of a playthrough's page, per inventory group, per kind of codex entry and per quest
// status. An icon only ever repeats what a word next to it says, so it is hidden from screen readers (aria-hidden, lucide's default).
import {
  SlidersHorizontal,
  Backpack,
  BookOpen,
  CalendarDays,
  ChevronDown,
  CircleCheck,
  CircleDot,
  CircleSlash,
  CircleX,
  Compass,
  FlaskConical,
  Gem,
  Hammer,
  Hourglass,
  KeyRound,
  MapPin,
  NotebookPen,
  Package,
  ScrollText,
  Shield,
  Skull,
  Star,
  Sword,
  Swords,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export type { LucideIcon };

export const PART_ICONS: Record<string, LucideIcon> = {
  overview: Compass,
  character: UserRound,
  quests: ScrollText,
  items: Backpack,
  codex: BookOpen,
  sessions: CalendarDays,
  notes: NotebookPen,
  settings: SlidersHorizontal,
};

// By the keys Gamepanion suggests (backend ITEM_KINDS) and a few a game may use; any other group gets the box.
const ITEM_ICONS: Record<string, LucideIcon> = {
  weapon: Sword,
  armour: Shield,
  armor: Shield,
  shield: Shield,
  amulet: Gem,
  ring: Gem,
  talisman: Gem,
  consumable: FlaskConical,
  material: Hammer,
  collectible: Star,
  key: KeyRound,
};
export const itemIcon = (kind: string | null): LucideIcon => (kind && ITEM_ICONS[kind]) || Package;

export const CODEX_ICONS: Record<string, LucideIcon> = { boss: Skull, enemy: Swords, npc: UserRound, place: MapPin };

export const QUEST_ICONS: Record<string, LucideIcon> = { open: CircleDot, blocked: Hourglass, done: CircleCheck, failed: CircleX, dropped: CircleSlash };

/** A section's heading: its picture in a small seal, tinted in the colour of the part it is in, then its name. */
export function Heading({ icon: Icon, children, className = "" }: { icon: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <h3 className={`section-title ${className}`}>
      <span className="seal">
        <Icon aria-hidden="true" />
      </span>
      {children}
    </h3>
  );
}

/** A group inside a part (Weapons, Bosses), folding: its band is a native disclosure (keyboard and screen readers know it), larger than
 * a tag chip, with how many it holds (under a tag, how many of those; components/TagFilter.tsx) and a chevron that turns when it folds. Open to start with. */
export function Group({ icon: Icon, label, count, children }: { icon: LucideIcon; label: ReactNode; count: number; children: ReactNode }) {
  return (
    <details open className="group-fold" data-tag-scope>
      <summary className="group-heading">
        <Icon aria-hidden="true" />
        <h3 className="flex-1">{label}</h3>
        <span className="group-count" data-tag-count={count}>
          {count}
        </span>
        <ChevronDown aria-hidden="true" className="group-chevron" />
      </summary>
      {children}
    </details>
  );
}

/** The tile at the start of a card: what kind of thing the card is. */
export function Tile({ icon: Icon, muted = false }: { icon: LucideIcon; muted?: boolean }) {
  return (
    <span className={`tile ${muted ? "tile-muted" : ""}`}>
      <Icon aria-hidden="true" />
    </span>
  );
}
