# Konfiguration

questlog läuft als ein Container mit einem Volume, aus dem Image `ghcr.io/marceltov/questlog`. Ein Server braucht zwei Dateien und keinen Checkout: [`compose.yaml`](https://github.com/Marceltov/questlog/blob/main/compose.yaml), das das Image startet, und daneben eine `.env`-Datei mit allen Einstellungen, eine ausgefüllte Kopie von [`.env.example`](https://github.com/Marceltov/questlog/blob/main/.env.example). Einstellungen sind Umgebungsvariablen: `QUESTLOG_*`, dazu die gemeinsamen `PUBLIC_URL`, `DATA_DIR`, `PORT` und `TZ`.

```bash
curl -fsSLO https://raw.githubusercontent.com/Marceltov/questlog/main/compose.yaml
curl -fsSL -o .env https://raw.githubusercontent.com/Marceltov/questlog/main/.env.example
chmod 600 .env   # dann ausfüllen
docker compose up -d
```

Aktualisieren: `docker compose pull && docker compose up -d`. `:main` folgt dem main-Branch; ein Image-Watcher wie Watchtower kann das nach seinem Zeitplan erledigen.

## Variablen

| Variable | Standard | Was sie tut |
|---|---|---|
| `PUBLIC_URL` | `http://localhost:${PORT}` außerhalb von Produktion; in Produktion **Pflicht** | Die Adresse, unter der Spieler und Claude questlog erreichen. Der Issuer der Anmeldung und die MCP-Ressource (`${PUBLIC_URL}/mcp`) werden daraus gebildet. |
| `DATA_DIR` | `/data` | Enthält `questlog.sqlite` (das Log), `auth.sqlite` (Anmeldung) und, falls erzeugt, `secret`. |
| `PORT` | `3000` | Der Port, auf dem der Server lauscht. `/mcp` liest die Schlüssel der Anmeldung auch von `127.0.0.1:${PORT}`. |
| `TZ` | `Europe/Berlin` | Die Zeitzone von „heute", dem Standardtag einer Spielsession. |
| `QUESTLOG_SECRET` | erzeugt in `${DATA_DIR}/secret` | Signiert Session-Cookies und verschlüsselt die Schlüssel zum Signieren von Tokens. Mindestens 32 Bytes (`openssl rand -hex 32`). Eine Änderung meldet alle ab. |
| `QUESTLOG_SIGNUP_ALLOW` | leer: niemand Neues | Wer Spieler werden darf: Adressen, `@domain`-Einträge oder `*`, durch Kommas getrennt. Bestehende Spieler melden sich weiter an. |
| `QUESTLOG_SMTP_URL` | nicht gesetzt: keine E-Mail-Codes | Ein SMTP-Server für Anmeldecodes, `smtp://` oder `smtps://user:password@host:port`. |
| `QUESTLOG_SMTP_FROM` | (Pflicht mit SMTP) | Die Absenderadresse der Codes. |
| `QUESTLOG_OIDC_<NAME>_ISSUER` | nicht gesetzt | Die Issuer-URL eines OpenID-Connect-Anbieters. `<NAME>` wählst du (Buchstaben und Ziffern); ein Block pro Anbieter. |
| `QUESTLOG_OIDC_<NAME>_CLIENT_ID` | (Pflicht mit Issuer) | Die Client-ID, die questlog bei diesem Anbieter hat. |
| `QUESTLOG_OIDC_<NAME>_CLIENT_SECRET` | leer | Ihr Secret, für einen vertraulichen Client. |
| `QUESTLOG_OIDC_<NAME>_LABEL` | der Name | Der Text des Knopfs: „Weiter mit `<LABEL>`". |
| `QUESTLOG_LOG_LEVEL` | `info` | `error`, `warn`, `info`, `debug` oder `silent`. |

Mindestens ein Weg zur Anmeldung ist nötig: SMTP für E-Mail-Codes, oder ein Anbieter.

## OpenID-Connect-Anbieter

Registriere questlog beim Anbieter (authentik, Google, jeder OpenID-Connect-Anbieter) mit der Redirect-URI `${PUBLIC_URL}/api/auth/callback/<name>`, wobei `<name>` `<NAME>` in Kleinbuchstaben ist. Für authentik:

```bash
QUESTLOG_OIDC_AUTHENTIK_ISSUER=https://authentik.example.com/application/o/questlog/
QUESTLOG_OIDC_AUTHENTIK_CLIENT_ID=...
QUESTLOG_OIDC_AUTHENTIK_CLIENT_SECRET=...
QUESTLOG_OIDC_AUTHENTIK_LABEL=authentik
```

Eine Anmeldung über einen Anbieter wird mit einem bestehenden Spieler gleicher Adresse nur verbunden, wenn der Anbieter die Adresse als bestätigt meldet ([ADR 0006](../adr/0006-better-auth-wiring.md)).

Lehnt ein Anbieter eine Anmeldung ab, zeigt die Anmeldeseite seinen Fehlercode, und questlogs Log hat eine Zeile dazu.

## Daten und Backups

Sichere `DATA_DIR`. `questlog.sqlite` ist das Log; `auth.sqlite` enthält Konten, Sessions und die verbundenen Clients, also enthält eine Kopie des Logs allein keine Tokens ([ADR 0004](../adr/0004-sign-in-with-better-auth.md)). Geht `auth.sqlite` verloren, sind alle abgemeldet und es ist verloren, wer wer ist: Behalte beide.

SQLite läuft im WAL-Modus: Neue Daten stehen eine Weile in `questlog.sqlite-wal`. Sichere den ganzen Ordner, oder kopiere mit `sqlite3 questlog.sqlite ".backup kopie.sqlite"`; die Hauptdatei allein kann fast leer sein.

`GET /health` antwortet `{"status":"ok"}`, solange die Datenbank antwortet; der `HEALTHCHECK` des Images nutzt es.
