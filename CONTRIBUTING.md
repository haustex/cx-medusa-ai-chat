# Contributing

Thank you for helping! Bug reports, fixes, providers and translations are welcome. For larger changes please open
an issue first. One rule is not up for discussion: the assistant may only state prices, stock, shipping figures and
policies that come from the store's data through the tools.

## Setup

Node.js 20.19+ or 22.12+, Docker (for the end-to-end Postgres).

```bash
npm ci
npm run build
```

## Checks

Every pull request runs these in CI, against Medusa 2.19.0 and 2.22.2:

```bash
npm run lint
npm run typecheck        # the plugin and the Admin extension
npm run test:unit
npm run build
npm run pack:check       # what `npm pack` would publish
npm run test:e2e
```

To try another Medusa release locally: `node scripts/use-medusa.mjs 2.22.2` (not saved; `npm ci` goes back).

## End-to-end tests

`integration-tests/e2e.mjs` creates a fresh database, migrates, starts Medusa on port 9800 with the plugin and the
mock provider, then drives the Store and Admin APIs: config, consent, streamed answers with product cards from a
real product, the amount guard, injection text, card numbers, policy pages, WhatsApp handover (tool and button) with
the Admin feed, feedback, the daily budget, the switch, Admin settings/sessions/stats, retention.

```bash
docker run -d --name ac-spike-pg -e POSTGRES_PASSWORD=spike -e POSTGRES_DB=ac_spike \
  -p 127.0.0.1:55437:5432 postgres:17-alpine
npm run build && npm run test:e2e
```

`AC_ADMIN=1 AC_KEEP=1 npm run test:e2e` builds the Admin too and keeps the server running on
http://127.0.0.1:9800/app (login `admin@e2e.test` / `e2e-password-123`) to look at the AI Assistant page.
`AC_PROVIDER=anthropic AI_CHAT_API_KEY=… npm run test:e2e` runs the suite against the real model (the mock-specific
expectations will then differ; useful for manual exploration with `AC_KEEP=1`).

Every Medusa command goes through `scripts/guard.mjs`, which refuses any database other than `127.0.0.1:55437`,
any Redis other than `127.0.0.1:56384` and HTTP ports below 9800.

## Database changes

Change a model in `src/modules/ai-chat/models`, then generate the migration against the throwaway database:

```bash
export DATABASE_URL=postgres://postgres:spike@127.0.0.1:55437/ac_spike REDIS_URL=redis://127.0.0.1:56384
npm run db:generate
```

## Style

TypeScript, no semicolons, long lines are fine; comments say why, not what. Keep the provider interface
(`src/lib/providers/types.ts`) small: a new provider implements `stream()` and nothing else.
