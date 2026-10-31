# Configuration

questlog runs as one container with one volume, from the image `ghcr.io/marceltov/questlog`. A server needs two files and no checkout: [`compose.yaml`](https://github.com/Marceltov/questlog/blob/main/compose.yaml), which runs the image, and a `.env` file next to it with every setting, a filled-in copy of [`.env.example`](https://github.com/Marceltov/questlog/blob/main/.env.example). Settings are environment variables: `QUESTLOG_*`, plus the shared `PUBLIC_URL`, `DATA_DIR`, `PORT` and `TZ`.

```bash
curl -fsSLO https://raw.githubusercontent.com/Marceltov/questlog/main/compose.yaml
curl -fsSL -o .env https://raw.githubusercontent.com/Marceltov/questlog/main/.env.example
chmod 600 .env   # then fill it in
docker compose up -d
```

To update: `docker compose pull && docker compose up -d`. `:main` follows the main branch; an image watcher such as Watchtower can do the same on its schedule.

## Variables

| Variable | Default | What it does |
|---|---|---|
| `PUBLIC_URL` | `http://localhost:${PORT}` outside production; **required** in production | The address players and Claude reach questlog at. The sign-in's issuer and the MCP resource (`${PUBLIC_URL}/mcp`) are built from it. |
| `DATA_DIR` | `/data` | Holds `questlog.sqlite` (the log), `auth.sqlite` (sign-in) and, if generated, `secret`. |
| `PORT` | `3000` | The port the server listens on. `/mcp` also reads the sign-in's keys from `127.0.0.1:${PORT}`. |
| `TZ` | `Europe/Berlin` | The time zone of "today", the default day of a play session. |
| `QUESTLOG_SECRET` | generated into `${DATA_DIR}/secret` | Signs session cookies and encrypts the token signing keys. At least 32 bytes (`openssl rand -hex 32`). Changing it signs everyone out. |
| `QUESTLOG_SIGNUP_ALLOW` | empty: nobody new | Who may become a player: addresses, `@domain` entries or `*`, comma-separated. Players who exist keep signing in. |
| `QUESTLOG_SMTP_URL` | unset: no email codes | An SMTP server for sign-in codes, `smtp://` or `smtps://user:password@host:port`. |
| `QUESTLOG_SMTP_FROM` | (required with SMTP) | The sender address of the codes. |
| `QUESTLOG_OIDC_<NAME>_ISSUER` | unset | An OpenID Connect provider's issuer URL. `<NAME>` is yours to choose (letters and digits); add one block per provider. |
| `QUESTLOG_OIDC_<NAME>_CLIENT_ID` | (required with an issuer) | The client id questlog has at that provider. |
| `QUESTLOG_OIDC_<NAME>_CLIENT_SECRET` | empty | Its secret, for a confidential client. |
| `QUESTLOG_OIDC_<NAME>_LABEL` | the name | The button's text: "Continue with `<LABEL>`". |
| `QUESTLOG_LOG_LEVEL` | `info` | `error`, `warn`, `info`, `debug` or `silent`. |

At least one way to sign in is needed: SMTP for email codes, or a provider.

## OpenID Connect providers

Register questlog at the provider (authentik, Google, any OpenID Connect provider) with the redirect URI `${PUBLIC_URL}/api/auth/callback/<name>`, where `<name>` is `<NAME>` in lower case. For authentik:

```bash
QUESTLOG_OIDC_AUTHENTIK_ISSUER=https://authentik.example.com/application/o/questlog/
QUESTLOG_OIDC_AUTHENTIK_CLIENT_ID=...
QUESTLOG_OIDC_AUTHENTIK_CLIENT_SECRET=...
QUESTLOG_OIDC_AUTHENTIK_LABEL=authentik
```

A sign-in through a provider joins an existing player with the same address only when the provider says the address is verified ([ADR 0006](../adr/0006-better-auth-wiring.md)).

When a provider refuses a sign-in, the login page shows its error code, and questlog's log has a line for it.

## Data and backups

Back up `DATA_DIR`. `questlog.sqlite` is the log; `auth.sqlite` holds accounts, sessions and the connected clients, so a copy of the log alone holds no tokens ([ADR 0004](../adr/0004-sign-in-with-better-auth.md)). Losing `auth.sqlite` signs everyone out and loses who is who: keep both.

SQLite runs in WAL mode: new data sits in `questlog.sqlite-wal` for a while. Back up the whole directory, or copy with `sqlite3 questlog.sqlite ".backup copy.sqlite"`; the main file alone can be nearly empty.

`GET /health` answers `{"status":"ok"}` while the database answers; the image's `HEALTHCHECK` uses it.
