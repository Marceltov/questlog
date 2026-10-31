---
status: accepted
date: 2026-10-31
decision-makers: Marcel Bruckner
---

# Icons from lucide, only next to words

## Context and Problem Statement

The playthrough page and the contents page were plain cards under all-caps labels; the player found them dull and asked for icons. Where do they come from, and what may they carry?

## Considered Options

* **lucide** (`lucide-react`, already a dependency): one consistent line style, tree-shaken per icon, React components that take `className` and `aria-hidden`.
* **Drawn by hand** as inline SVG: fits the almanac exactly, but every new kind of item or codex entry needs a drawing.
* **An emoji per thing**: no dependency, but looks different on every system and screen readers read it out.

## Decision Outcome

Chosen option: **lucide**, through one module, `components/icons.tsx`: the icon of each register part, inventory group, kind of codex entry and quest status, the `Heading` (an icon in a seal, then the name) and the `Tile` at the start of a card. An icon never stands alone: a word next to it says the same, so icons are `aria-hidden`. They take the colour of the register part they are in (`--c`), ember outside it. The app's own pictures (the icon, the backdrop, the bookmark ribbon) stay drawn by hand.

### Consequences

* Good, because a new inventory group or codex kind gets an icon by adding one line to the map; anything unknown falls back to a box.
* Bad, because lucide's line style is generic; the hand-drawn parts carry the almanac's character.
