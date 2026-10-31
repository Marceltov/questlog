# Development

Node 22 (`.nvmrc`). Copy `.env.example` to `.env`, set `DATA_DIR=./data`, `QUESTLOG_SIGNUP_ALLOW` to your address and a way to sign in (for email codes in development, any local SMTP catcher such as Mailpit at `smtp://localhost:1025`).

```bash
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Next.js |
| `npm run typecheck` | `next typegen` and `tsc --noEmit` |
| `npm run lint` | ESLint, with the frontend/backend boundary and `eslint-config-prettier` last |
| `npm run format` / `npm run format:check` | Prettier at 160 columns |
| `npm test` | Vitest; `npx vitest run <file>` for one file |

The tests that matter most:

- `backend/spoilers.test.ts`: the spoiler gate on every read path.
- `backend/isolation.test.ts`: player B never sees player A's log, counts and summaries included, and can't write into it. They use the two-player seed in `backend/testing/fixtures.ts`; a new read path adds its assertions there.
- `backend/tools.test.ts`: each MCP tool and its `next`.
- `backend/auth/oauth.test.ts`: the whole sign-in over HTTP, from the first 401 on `/mcp` to the tools answering as the player.

Docs: `uvx --with mkdocs-material==9.7.7 --with 'mkdocs<2' --with mkdocs-static-i18n==1.3.1 mkdocs serve`.
