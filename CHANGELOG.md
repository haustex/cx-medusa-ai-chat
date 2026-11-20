# Changelog

## 0.1.1 — 2026-11-20

- Search across languages: the native `q` only matches the untranslated title, so an English question on an
  Indonesian catalog found nothing. Now the Store API gets the market's translation locale (`en-US`), a failed search
  falls back to a word match over the listed products (title, description, categories, collection, metadata such as
  `title_en`), and the model is told the catalog's language and to retry with words in it. Options
  `catalog.language`, `catalog.translation_locales`, `catalog.fallback_scan`.
- Sessions without `region_id` get the region from the country or currency, so prices still come back.

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
