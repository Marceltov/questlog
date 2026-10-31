# Claude verbinden

questlogs MCP-Endpunkt ist `${PUBLIC_URL}/mcp`. Öffne in claude.ai _Einstellungen → Connectors → Eigenen Connector hinzufügen_ und gib diese Adresse an. Claude registriert sich, schickt dich zu questlogs Anmeldeseite und bittet dich, die Verbindung zu erlauben.

```mermaid
sequenceDiagram
  participant C as claude.ai
  participant Q as questlog
  participant P as Spieler (Browser)
  C->>Q: POST /mcp, ohne Token
  Q-->>C: 401, siehe /.well-known/oauth-protected-resource/mcp
  C->>Q: registrieren (oder ein Client-Metadaten-Dokument)
  C->>P: die Autorisierungsseite öffnen
  P->>Q: mit E-Mail-Code oder Anbieter anmelden, dann Erlauben
  Q-->>C: ein Code, getauscht gegen ein 10-Minuten-Access-Token für /mcp
  C->>Q: POST /mcp mit dem Token: Werkzeuge als dieser Spieler
```

Claude erneuert das Token selbst; du meldest dich einmal an. Ein Token gilt nur für `/mcp`, und nur für den Spieler, der sich angemeldet hat.

Dann erzähl Claude, was du spielst. Es legt jede Session mit `record` ab und beantwortet „Wo war ich?" mit `briefing`. Die Werkzeuge stehen unter [MCP-Werkzeuge](../reference/mcp-tools.md) (auf Englisch).
