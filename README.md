<p align="center">
  <a href="https://hauskayu.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/haustex/cx-medusa-ai-chat/main/docs/logo-dark.svg">
      <img src="https://raw.githubusercontent.com/haustex/cx-medusa-ai-chat/main/docs/logo.svg" alt="Haus Kayu" width="260">
    </picture>
  </a>
</p>

# medusa-ai-chat

**An AI shopping assistant for Medusa v2 storefronts that only says what your store data says.** It searches the
catalog, reads prices, stock, variants and shipping rates through tools, quotes your own policy pages, streams the
answer, and hands the visitor over to a human on WhatsApp (pre-filled message with a summary) whenever the question
is a complaint, a refund, a negotiation, a custom order, or something it cannot answer. A sentence-level guard drops
any amount the tools did not return, so an invented price never reaches the visitor.
<br>Asisten AI untuk storefront Medusa v2 yang hanya menjawab dari data toko: cari produk, harga, stok, ongkir,
kebijakan, streaming, dan oper ke WhatsApp CS dengan ringkasan obrolan. Angka yang tidak berasal dari tools tidak
pernah tampil.

[![npm](https://img.shields.io/npm/v/medusa-ai-chat)](https://www.npmjs.com/package/medusa-ai-chat)
[![CI](https://github.com/haustex/cx-medusa-ai-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/haustex/cx-medusa-ai-chat/actions/workflows/ci.yml)
[![Medusa](https://img.shields.io/badge/Medusa-2.19%20%E2%80%93%202.22-7c3aed)](https://medusajs.com)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

### Screenshots

Admin → AI Assistant (demo store, example conversations) and the chat panel of a storefront (Kiln, the theme of
hauskayu.com).

| Overview: today's spend against the daily budget, 30-day counts | Conversations: filters, cost, handover and thumbs per chat |
| --- | --- |
| ![Admin overview](https://raw.githubusercontent.com/haustex/cx-medusa-ai-chat/main/docs/screenshots/admin-overview.png) | ![Admin conversations](https://raw.githubusercontent.com/haustex/cx-medusa-ai-chat/main/docs/screenshots/admin-conversations.png) |

| A conversation: tools called, tokens, cost, WhatsApp handover | Settings: switch, budget, greeting per language, extra instructions, FAQ |
| --- | --- |
| ![Admin conversation](https://raw.githubusercontent.com/haustex/cx-medusa-ai-chat/main/docs/screenshots/admin-conversation.png) | ![Admin settings](https://raw.githubusercontent.com/haustex/cx-medusa-ai-chat/main/docs/screenshots/admin-settings.png) |

| Storefront, phone (Indonesian): answer with a product card | Storefront, desktop (English): handover to WhatsApp |
| --- | --- |
| ![Storefront phone](https://raw.githubusercontent.com/haustex/cx-medusa-ai-chat/main/docs/screenshots/storefront-phone-id.png) | ![Storefront desktop](https://raw.githubusercontent.com/haustex/cx-medusa-ai-chat/main/docs/screenshots/storefront-desktop-en.png) |

### Compatibility

| Plugin | Medusa | Node | Tested in CI on |
| --- | --- | --- | --- |
| 0.1.x | 2.19.0 or newer 2.x (`^2.19.0`) | 20.19+ or 22.12+ | Medusa 2.19.0 and 2.22.2 |

Model providers: **Anthropic** (default, `claude-haiku-5-5`), any **OpenAI-compatible** chat-completions API, and a
deterministic **mock** for tests. Optional integrations it detects at runtime: the Meilisearch store route of
`@rokmohar/medusa-plugin-meilisearch` (better search), the public rate card of `medusa-fulfillment-zone-rate`
(shipping estimates), the Local Notification Provider on channel `feed` (Admin bell on handover).

### Quick start

```bash
npm install medusa-ai-chat
```

```ts
// medusa-config.ts
plugins: [
  {
    resolve: "medusa-ai-chat",
    options: {
      store: { name: "Haus Kayu", description: "Teak kitchenware and custom furniture from Jepara.", location: "Jepara, Indonesia" },
      storefront: { url: "https://hauskayu.com", custom_path: "/custom", path_prefixes: ["", "/us"] },
      assistant: { name: { id: "Asisten AI Haus Kayu", en: "Haus Kayu AI Assistant" }, locales: ["id", "en"] },
      contact: { whatsapp: "6281234567890", hours: { id: "Setiap hari 08.00–21.00 WIB", en: "Every day 8 am–9 pm WIB" } },
      knowledge: {
        pages: {
          shipping: { id: "https://hauskayu.com/shipping/markdown", en: "https://hauskayu.com/us/shipping/markdown" },
          returns: { id: "https://hauskayu.com/returns/markdown", en: "https://hauskayu.com/us/returns/markdown" },
        },
      },
      budget: { daily_usd: 1, timezone: "Asia/Jakarta" },
    },
  },
],
```

```bash
export AI_CHAT_API_KEY=...   # the model API key lives in the environment, never in options
npx medusa db:migrate
```

Open **AI Assistant** in the Admin sidebar: switch, greeting, FAQ, daily budget, conversations, statistics.
Storefront integration: `GET /store/ai-chat/config`, `POST /store/ai-chat/sessions`, then stream
`POST /store/ai-chat/sessions/:id/messages` (server-sent events). Types and an SSE reader ship in
`medusa-ai-chat/client`. The Kiln theme has a ready-made glass chat panel for this plugin.

### What the assistant can and cannot do

| It does | It never does |
| --- | --- |
| Searches products and quotes price, stock and variants per region/currency, in the visitor's language (Translation Module) | States an amount, discount, stock level or delivery date no tool returned (the guard removes the sentence and offers CS) |
| Gives shipping services, per-kg rates and delivery estimates from the real rate card | Promises anything: discounts, reservations, refunds, custom work |
| Answers policy questions from your own pages (markdown, text or HTML) and the Admin FAQ | Asks for or accepts payment details (card numbers are blocked before the model and masked in storage) |
| Hands over to WhatsApp with greeting, summary, product links and a chat id; posts to the Admin feed | Follows instructions found in customer text or catalog data (both are wrapped as data) |
| Streams the answer sentence by sentence | Sends a prompt larger than `limits.max_prompt_tokens` (older turns are summarised first) |

### Store API

| Route | Purpose |
| --- | --- |
| `GET /store/ai-chat/config?lang=` | `enabled`, `over_budget`, name, greeting, CS hours, WhatsApp number, privacy path, limits |
| `POST /store/ai-chat/sessions` | `{ locale, country_code?, region_id?, currency_code?, path_prefix?, page?, consent: true }` → `{ session: { id, token, turns_left } }` |
| `POST /store/ai-chat/sessions/:id/messages` | `{ token, message, page? }` → SSE: `start`, `delta`, `products`, `handoff`, `notice`, `done`, or `error` |
| `POST /store/ai-chat/sessions/:id/handoff` | `{ token }` → the WhatsApp link for the "Chat with CS" button (summary of the conversation) |
| `POST /store/ai-chat/messages/:id/feedback` | `{ token, session_id, value: 1 \| -1 \| 0 }` |

Every call carries the storefront's publishable key; the tools call your own Store API with the same key, so the
assistant sees exactly the products, prices and stock that storefront sees. The session token is random and only
its hash is stored; the IP address is stored as a salted hash for rate limiting only.

### Admin API

`GET/POST /admin/ai-chat/settings`, `GET /admin/ai-chat/config`, `GET /admin/ai-chat/stats?days=`,
`GET /admin/ai-chat/sessions` (filters `handoff`, `feedback`, `flagged`, `lang`, `q`), `GET|DELETE /admin/ai-chat/sessions/:id`.

### Options

| Option | Default | Notes |
| --- | --- | --- |
| `provider.id` | `"anthropic"` | `"openai"` for any OpenAI-compatible API (`provider.base_url`, `provider.model` required), `"mock"` for tests |
| `provider.model` | `"claude-haiku-5-5"` | |
| `provider.api_key_env` | `"AI_CHAT_API_KEY"` | Name of the environment variable holding the key |
| `provider.effort` | `"low"` | Anthropic effort level |
| `pricing` | known for Anthropic models | USD per million tokens `{ input, output, cache_read, cache_write }`; needed for cost tracking of other models |
| `store.name` / `description` / `location` | | Facts for the model and the WhatsApp greeting |
| `storefront.url` | | Base of product links; `product_path` default `/products/{handle}`; `custom_path` (made-to-order page) ; `privacy_path` default `/privacy`; `path_prefixes` accepted market prefixes |
| `assistant.name` / `greeting` | | Per locale; the Admin greeting overrides |
| `assistant.locales` | `["en"]` | Locales the storefront may request; the first is the fallback |
| `assistant.instructions` | | Developer text appended to the system prompt (tone etc.) |
| `contact.whatsapp` | | International number without `+`; without it there is no handoff tool |
| `contact.hours` | | Per locale; shown next to the CS button and told to the model |
| `knowledge.pages` | `{}` | topic → locale → URL of a page the `get_policy` tool may read (cached `cache_seconds`, cut at `max_chars`) |
| `catalog.hide_when_metadata` | `["secret","hidden"]` | Products with such metadata set to true are never shown |
| `catalog.language` | first locale | Language the catalog is written in; the model retries a failed search with words in it |
| `catalog.translation_locales` | derived | Medusa translation locale per assistant locale (`{ en: "en-US" }`); default `<locale>-<COUNTRY>` of the market |
| `catalog.fallback_scan` | `100` | When a search finds nothing, this many products are listed and matched by words (title, description, categories, metadata); `0` disables |
| `shipping.enabled` | `true` | `shipping_estimate` tool; switches itself off when the zone-rate route is missing |
| `limits` | see below | `max_message_chars` 1000, `max_turns` 20, `history_messages` 12, `summarize_after_tokens` 8000, `max_prompt_tokens` 30000, `max_output_tokens` 700, `max_tool_rounds` 4, `per_ip.hour` 30, `per_ip.day` 100, `per_session_minute` 6 |
| `budget.daily_usd` | `1` | Spend cap per calendar day in `budget.timezone` (default UTC); the Admin setting overrides. Over the cap, visitors get the WhatsApp button only |
| `retention_days` | `30` | Conversations are deleted by a nightly job |
| `feed` | `{ enabled: true, channel: "feed", template: "admin-ui" }` | Admin bell on handover; `admin_url` for the link |
| `backend_url` | `http://127.0.0.1:$PORT` | Where the tools reach this server's Store API |
| `showCredit` | `false` | Small plugin credit under the Admin page |

### Cost

With Claude Haiku 5.5 the stable prompt (rules + tools, ≈2,500 tokens) is read from the prompt cache after the
first call of a 5-minute window; a typical turn with one tool call costs about $0.0005–0.001, a six-turn
conversation $0.003–0.006. Cache writes, cache reads, input and output are all counted against the daily budget.

### Other model calls on the same budget

Other features of the store that call a model with the same key (a search rewrite, a description helper) can share
the assistant's daily budget, Admin statistics, rate limiter and price list through `medusa-ai-chat/budget`, the only
public server API of the package (everything else is internal):

```ts
import { budgetStatus, clientIp, ipHash, rateLimits, recordUsage, takeRateLimit } from "medusa-ai-chat/budget"

// in an API route
const status = await budgetStatus(req.scope, { feature: "search", share: 0.3 })
if (status.over_budget) return res.json({ terms: [] }) // the assistant keeps the other 70 %

const { per_ip } = rateLimits(req.scope)
const ip = ipHash(req.scope, clientIp(req))
if (!(await takeRateLimit(req.scope, `search:h:${ip}`, per_ip.hour, 3600))) return res.status(429).end()

const message = await anthropic.messages.create({ /* … */ })
await recordUsage(req.scope, {
  model: "claude-haiku-5-5",
  feature: "search",
  usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens },
})
```

| Export | |
| --- | --- |
| `budgetStatus(container, { feature?, share? })` | Today's cap, total spend, the feature's spend and cap, `over_budget` (total reached the cap, or the feature its `share` of it) |
| `recordUsage(container, { usage, model?, feature? })` | Adds a call to today's usage row and the feature counter; returns the cost in USD |
| `pricingFor(container, model?)` / `costOf(usage, pricing)` | USD per million tokens (the `pricing` option for the assistant's model, else published prices) and the cost of one call |
| `rateLimits(container)` / `takeRateLimit(container, key, max, windowSeconds)` | The assistant's per-IP limits and a fixed-window counter through the Cache Module, namespaced apart from the assistant's own |
| `clientIp(req)` / `ipHash(container, ip)` | The visitor's address (Cloudflare header first) and its salted hash for rate-limit keys |

Feature counters live in the Cache Module (Redis when the store has it) for two days; the daily total is the
persistent usage row the assistant itself reads.

### Privacy

Tell your visitors that chat messages are processed by the model provider (Anthropic, or the API you configured)
and kept for `retention_days`. The storefront must show a consent notice before the first message and send
`consent: true`; the plugin refuses sessions without it. Card numbers are blocked and masked; IPs are hashed; the
Admin can delete any conversation.

### Development

See [CONTRIBUTING.md](CONTRIBUTING.md). `npm run eval -- <storefront base url>` sends a red-team prompt set to a
running store and prints the answers and guard notices (needs the real provider; costs a few cents).

MIT © Haus Kayu
