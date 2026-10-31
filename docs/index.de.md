---
hide:
  - navigation
  - toc
---

<div class="ql-hero" markdown>

<img class="ql-hero__mark" src="assets/icon.svg" alt="">

# Behalte, wo du in jedem Spiel stehst.

<p class="ql-hero__lead">questlog ist Questlog, Build-Tracker und Inventar für die Spiele, die du spielst. Du erzählst es Claude beim Spielen; wenn du zurückkommst, sagt dir Claude, was noch offen ist. Es zeigt immer nur, was du schon gefunden hast.</p>

[Einrichten](self-hosting/configuration.md){ .md-button .md-button--primary }
[Wofür es steht](values.md){ .md-button }

</div>

## So funktioniert es

```mermaid
sequenceDiagram
  participant P as Spieler
  participant C as Claude
  participant Q as questlog (/mcp)
  P->>C: "Polendina das Ergo gegeben, Eugenie braucht eine bessere Werkstatt"
  C->>Q: record: die Worte, zwei Quests, ein Werte-Stand
  Q-->>C: was abgelegt wurde, und next: lies es vor
  C-->>P: "Polendina ist erledigt, Eugenies Werkstatt wartet aufs Spiel"
  Note over P,Q: Tage später
  P->>C: "Wo war ich in Lies of P?"
  C->>Q: briefing
  Q-->>C: letzte Session, offene Quests, Build, Ausrüstung (keine Spoiler)
  C-->>P: wo du aufgehört hast, und was noch offen ist
```

Von oben gelesen: Der Spieler erzählt, Claude legt es über questlogs MCP-Endpunkt ab, und ein späteres Briefing bringt nur zurück, was der Spieler gefunden hat.

- **Erzählen statt eintippen.** Claude legt jede Spielsession über questlogs eingebauten MCP-Endpunkt ab: deine Worte, wie du sie gesagt hast, die Quests, die du begonnen oder abgeschlossen hast, deine Werte, dein Build und die Gegenstände, die du gefunden hast.
- **„Wo war ich?"** Ein Briefing gibt dir die letzte Session, die offenen Quests mit ihren nächsten Schritten, deinen aktuellen Build und deine Ausrüstung.
- **Keine Spoiler.** Jeder Quest-Eintrag und jeder Gegenstand hat eine Spoiler-Stufe, und eine einzige Funktion entscheidet, was du siehst. Hinweise erscheinen nur, wenn du danach fragst, hinter einer Warnung.
- **Dein Log gehört dir.** Jeder, der sich anmeldet, hat seine eigenen Spiele und Durchläufe; niemand sonst auf der Instanz sieht sie.
- **Jedes Spiel.** Wertenamen und Inventargruppen sind Daten, in der Sprache des Spiels neben dem Englischen.
- **Ein Container.** Next.js und SQLite auf deinem eigenen Server; nichts telefoniert nach Hause.
