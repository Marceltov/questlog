# Connect Claude

Gamepanion's MCP endpoint is `${PUBLIC_URL}/mcp`. In claude.ai, open _Settings → Connectors → Add custom connector_ and give it that address. Claude registers itself, sends you to Gamepanion's sign-in page, and asks you to allow the connection.

```mermaid
sequenceDiagram
  participant C as claude.ai
  participant Q as Gamepanion
  participant P as Player (browser)
  C->>Q: POST /mcp, no token
  Q-->>C: 401, see /.well-known/oauth-protected-resource/mcp
  C->>Q: register (or a client metadata document)
  C->>P: open the authorize page
  P->>Q: sign in with an email code, a passkey or a provider, then Allow
  Q-->>C: a code, swapped for a 10-minute access token bound to /mcp
  C->>Q: POST /mcp with the token: tools as this player
```

Claude refreshes the token by itself; you sign in once. A token only works on `/mcp`, and only for the player who signed in.

Then tell Claude what you are playing. It files each session with `record`, and answers "where was I?" with `briefing`. The tools are on [MCP tools](../reference/mcp-tools.md).
