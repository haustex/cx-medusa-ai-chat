# CLAUDE.md — medusa-ai-chat (AI shopping assistant by Haus Kayu)

## ⚠️ Server rules (read before doing anything)

This host also runs the **hauskayu.com production store**.

- **Never** send requests to ports `9000`, `8000`, `80`, `443`, `5432`, `6379` or any `*.hauskayu.com` domain from tests.
- **Never** touch the `hauskayu-*` containers.
- Test **only** on ports `9800+` and the `ac-spike-*` containers (Postgres `127.0.0.1:55437`, Redis `127.0.0.1:56384`).
- Every medusa/db command goes **through `scripts/guard.mjs`**.
- **Never commit** secrets or `.env` files; the model API key is read from `AI_CHAT_API_KEY` only. Do not publish to
  npm or push to GitHub until the maintainer (Haus Kayu) says OK.

## Technical decisions

- The model loop runs in the backend (`src/lib/chat.ts`), not in the storefront: tools read live data, the key stays
  on the server, logs/limits/budget live in one place, any storefront can attach a UI.
- Tools call the store's **own Store API over loopback** (`backend_url`) with the visitor's publishable key, so
  prices (region), translations (`locale`), inventory and sales-channel scoping are exactly the storefront's.
- Provider interface `AiProvider.stream()` (`src/lib/providers/types.ts`); Anthropic uses prompt caching on the
  stable system block + tool list, `strict: true`, effort `low`; OpenAI-compatible is plain fetch + SSE; `mock`
  reacts to keywords ("ngarang" produces an invented price to exercise the guard).
- Guards are deterministic: `SentenceGate` streams sentence by sentence and drops any sentence whose amounts are
  not in the allowed set (numbers from tool results of the session, earlier guarded answers, the customer's own
  text); Luhn card detection before the model; customer text as `<customer_message>` with angle brackets
  neutralised; tool results are JSON data.
- Prompt size: last `history_messages` verbatim, older turns summarised by the model once the last prompt exceeded
  `summarize_after_tokens`; estimated prompts above `max_prompt_tokens` are refused (Haiku 5.5 long-context tier).
- Daily budget = `ai_chat_usage` row per day (budget timezone), cost = input + output + cache read + cache write at
  the configured prices; over budget → `error over_budget` and `config.over_budget: true` (storefront shows the CS
  button only).
- Handoff: the WhatsApp message is composed server-side (greeting, model summary ≤400 chars, up to 4 product links,
  short chat id); Admin feed via the Notification Module channel `feed`, idempotent per session.
- E2E (`integration-tests/e2e.mjs`) runs the mock provider against a real Medusa app on 9800.

## Backlog

- Order tracking tool (e-mail + order number verification), product recommendations, analytics of questions the
  assistant could not answer (phase 2).
- Native Redis counter for the daily budget (today read-modify-write).

## Gotchas

- Store routes must not use a `locale` query parameter: Medusa's framework consumes it (Translation Module) and
  the route sees an empty query. The config route takes `?lang=`.
