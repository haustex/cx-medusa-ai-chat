# Changelog

## 0.1.0 — 2026-11-20

First release.

- Module `ai_chat`: sessions (token hash, market, usage, summary, handoff), messages (tool calls, cards, feedback,
  guard flags), one settings row, usage per day.
- Providers: Anthropic (streamed, prompt caching, strict tools, effort), OpenAI-compatible chat completions, mock.
- Tools from live store data: `search_products` (Meilisearch route when present, else native), `get_product`,
  `shipping_estimate` (medusa-fulfillment-zone-rate rate card), `get_policy` (your pages), `handoff_to_cs`.
- Guards: sentence-level amount check against tool results, card-number block + masking, customer text and tool
  results wrapped as data, message/turn/prompt-size limits with history summarisation, per-IP and per-session rate
  limits, daily budget incl. cache tokens.
- Store API with server-sent events; Admin API + page (switch, greeting, FAQ, budget, conversations, stats);
  Admin feed on handover; retention job.
