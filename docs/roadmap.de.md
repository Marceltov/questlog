---
hide:
  - toc
---

# Wohin questlog geht

questlog begann am 30.10.2026, aus einem Questlog, einer Build-Seite und einer Mechanik-Seite, die Claude in einem Trilium-Wiki geführt hat, während Marcel Lies of P spielte. Es wird zu dem Ort, an dem Claude eine Spielsession ablegt und „Wo war ich?" wieder ausliest, für jedes Spiel, ohne Spoiler.

Diese Seite sagt, was geplant ist und warum, innerhalb der [Werte](values.md), und was schon erschienen ist. Jeder Schritt verlinkt sein Issue und den Wert, dem er dient. Geplante Schritte haben kein Datum, nur jetzt, als Nächstes oder später; erschienene tragen den Tag, an dem sie erschienen sind.

## Die Idee hinter allem

Beim Spielen erzählen ist die Bedienung; questlog behält, was für deinen Durchlauf stimmt, und zeigt nur, was du gefunden hast.

<!-- roadmap -->

## Zurückgestellt

- **Ein gemeinsames Log oder eines für den Haushalt**: zwei Spieler, die demselben Durchlauf folgen. Heute gehört jedes Log allein seinem Spieler ([V2](values.md#v2-dein-log-gehort-dir-allein)); Teilen wäre eine bewusste Wahl, keine Voreinstellung.
- **Screenshots als Dateien**: ein geteilter Screenshot wird gelesen und als Text und Zahlen abgelegt ([V3](values.md#v3-dein-fortschritt-deine-worte)); questlog speichert ihn nicht.

## Dagegen entschieden

- **Eine Spieldatenbank oder ein gespiegeltes Wiki**: Sie wäre genau die Spoiler-Quelle, die [V1](values.md#v1-keine-spoiler-um-die-du-nicht-gebeten-hast) ausschließt, und würde fremde Arbeit kopieren ([V6](values.md#v6-dein-stand-nicht-der-des-internets), ADR 0002).
- **Statistiken über Spieler hinweg**: Sie würden das Log eines Spielers anderen zeigen ([V2](values.md#v2-dein-log-gehort-dir-allein)).

## Aktuell halten

Die Zeitleiste wird aus [`docs/roadmap.yml`](https://github.com/Marceltov/questlog/blob/main/docs/roadmap.yml) erzeugt; auf GitHub lies diese Datei. Die deutschen Texte stehen dort als `title_de` und `summary_de`.
