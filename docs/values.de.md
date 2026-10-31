# Wofür questlog steht

questlog behält, wo du in den Spielen stehst, die du spielst: die Quests, die du begonnen hast, deinen Build und die Gegenstände, die du gefunden hast. Du erzählst es Claude beim Spielen; wenn du zurückkommst, sagt dir Claude, was noch offen ist. Diese Seite sagt, was questlog bleiben wird, wer auch immer es betreibt und wozu auch immer es wächst.

Sie ist auch der Maßstab für jede Änderung: Ein Beitrag, von einem Menschen oder einer KI, wird an diesen Punkten gemessen, und ein Review nennt den, den er berührt („das bricht V1"). Jeder Punkt sagt, was er ausschließt, damit man ihn so verwenden kann.

Die englische Fassung ist die maßgebliche; Reviews und Issues zitieren die Punkte mit ihren Nummern.

## Grenzen, die nie überschritten werden

### V1. Keine Spoiler, um die du nicht gebeten hast

questlog zeigt dir nur, was du schon gefunden hast. Jede Quest, jeder Gegenstand und jede Notiz hat eine Spoiler-Stufe, und eine einzige Funktion entscheidet, was du siehst. Eine Liste dessen, was du verpasst haben könntest, gibt es nur, wenn du danach fragst, hinter einer Warnung, und nie in einem Briefing, einer Erinnerung oder einem Werkzeug-Ergebnis, um das du nicht gebeten hast.

**Schließt aus:** Quests, Gegenstände, Bosse oder Gebiete aufzulisten, die du noch nicht erreicht hast; „nächster Schritt"-Hinweise, die einen Boss, einen Ausgang oder ein Story-Ereignis nennen; eine Abschlussquote, die verrät, wie viel noch fehlt; Lesezugriffe, die die Spoiler-Prüfung umgehen.

### V2. Dein Log gehört dir allein

Jeder, der sich anmeldet, hat seine eigenen Spiele, Durchläufe und Fortschritte. Niemand sonst auf derselben Instanz sieht sie: nicht in einer Liste, einer Zahl, einem Briefing oder in irgendetwas, das Claude ihm sagt.

**Schließt aus:** geteilte Logs oder Haushalts-Logs als Voreinstellung, eine Admin-Ansicht in die Logs anderer, Bestenlisten oder Statistiken über Spieler hinweg, Lesezugriffe, die nicht auf den angemeldeten Spieler beschränkt sind.

### V3. Dein Fortschritt, deine Worte

Was du Claude erzählst, bleibt in deinen Worten: Jede Spielsession behält ihr Transkript, neben den Quest-Einträgen, Werte-Ständen und Gegenständen, die daraus abgelegt wurden. Ein Screenshot, den du teilst, bleibt nur, bis Claude ihn gelesen hat: Dann bleibt nur, was er zeigt, als Text und Zahlen.

**Schließt aus:** Screenshots nach dem Lesen aufzubewahren, eine Zusammenfassung statt dessen, was du gesagt hast, Fortschritt, den Claude erfunden hat („hat wohl X gemacht").

### V4. Du entscheidest, was abgelegt wird

Claude legt ab, was du erzählst, und fragt, wenn es sich nicht sicher ist: welche Quest du meinst, ob du etwas abgeschlossen oder nur begonnen hast, welche Wahl du getroffen hast. Eine Vermutung wird nie von selbst zu einem Log-Eintrag.

**Schließt aus:** Ablegen im Hintergrund ohne dich, eine Quest auf Verdacht als erledigt markieren, Quests oder Gegenstände ohne Nachfrage zusammenlegen.

## Worauf du dich verlassen kannst

### V5. Claude zuerst

Du erzählst, Claude legt ab. Alles funktioniert zuerst über MCP, und jedes Werkzeug-Ergebnis sagt Claude, was als Nächstes zu tun ist; die REST-API und die Web-App folgen. Die Web-App ist zum Nachschlagen auf dem Handy neben dem Bildschirm da.

**Schließt aus:** eine Funktion, die nur die Web-App hat, ein MCP-Werkzeug, das hinter der API zurückbleibt, Formulare als wichtigsten Weg zum Erfassen.

### V6. Dein Stand, nicht der des Internets

questlog behält, was für *deinen* Durchlauf stimmt: was du gefunden, getan und entschieden hast. Wissen über das Spiel (Wikis, Guides, Builds) bleibt, wo es ist. questlog darf eine Seite über etwas nachschlagen, das du gefunden hast, wenn du oder Claude danach fragen, und behält die Fakten, die es braucht (etwa die Skalierung eines Gegenstands), mit einem Link zur Seite; es spiegelt nie eine Quelle.

**Schließt aus:** eine Spieldatenbank mitzuliefern, ein Wiki zu crawlen oder zu spiegeln, den Text einer Quelle statt der Fakten und eines Links zu behalten, nachzuschlagen, was du noch nicht gefunden hast, die Behauptung eines Guides als deinen Fortschritt auszugeben.

### V7. Selbst gehostet ist alles dabei

questlog läuft als ein Container auf deinem eigenen Server, mit einer SQLite-Datei. Jede Funktion ist dabei, und nichts telefoniert nach Hause. Der Code steht unter AGPL-3.0: Jeder darf ihn betreiben, und eine geänderte Version, die als Dienst läuft, bleibt offen.

**Schließt aus:** Funktionen, die nur eine gehostete Version hat, Telemetrie, Analytics oder Skripte Dritter, ein Speicherformat, das nur questlog lesen kann.

### V8. Jedes Spiel, jede Sprache

questlog ist nicht für ein einzelnes Spiel gebaut. Werte, Gegenstandsarten und Quest-Zustände sind Daten, kein Code, also braucht ein neues Spiel kein neues Release. Die Oberfläche ist zuerst Englisch, auch auf Deutsch zu haben; die Sprache des Spiels (etwa deutsche Wertenamen) wird neben der englischen behalten.

**Schließt aus:** spielspezifische Tabellen oder Codepfade, fest einprogrammierte Wertelisten, eine Oberfläche in nur einer Sprache.

## Diese Seite ändern

Die Punkte behalten ihre Nummern, damit Reviews und Issues, die sie zitieren, stimmen. Eine Änderung an dieser Seite braucht die Zustimmung des Maintainers und sagt in ihrem Pull Request, warum; eine Änderung, die V1 bis V4 schwächt, ändert, was questlog ist.
