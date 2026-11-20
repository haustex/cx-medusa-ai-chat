import fs from "node:fs"
import path from "node:path"
import type { ConfigModule, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const PACKAGE_NAME = "medusa-ai-chat"

export type ProviderId = "anthropic" | "openai" | "mock"

/** USD per million tokens */
export type Pricing = { input: number; output: number; cache_read: number; cache_write: number }

export type LocaleText = Record<string, string>

export type PluginOptions = {
  provider?: {
    /** "anthropic" (default), "openai" (any OpenAI-compatible chat-completions API) or "mock" (tests) */
    id?: ProviderId
    /** Default "claude-haiku-5-5" for anthropic; required for openai */
    model?: string
    /** Environment variable that holds the API key. Default AI_CHAT_API_KEY. The key itself never goes in options. */
    api_key_env?: string
    /** openai: base URL of the API, e.g. https://api.openai.com/v1 */
    base_url?: string
    /** anthropic: effort level. Default "low" (chat). */
    effort?: "low" | "medium" | "high"
    /** Seconds before a model call is abandoned. Default 60. */
    timeout_seconds?: number
  }
  /** USD per million tokens; defaults are known for Anthropic models, required for other models */
  pricing?: Partial<Pricing>
  store?: {
    /** Shown to the model and in the WhatsApp greeting. Default "our store". */
    name?: string
    /** One or two sentences about the store for the model (what it sells, where it is) */
    description?: string
    /** Where the workshop/store is ("Jepara, Indonesia") */
    location?: string
  }
  storefront?: {
    /** Public URL without trailing slash; product links are `${url}${path_prefix}${product_path}` */
    url?: string
    /** Default "/products/{handle}" */
    product_path?: string
    /** Page for custom/made-to-order requests, e.g. "/custom"; null = no such page */
    custom_path?: string | null
    /** Privacy policy page, linked in the consent notice. Default "/privacy". */
    privacy_path?: string
    /** Accepted `path_prefix` values from the storefront (market prefixes). Default [""]. */
    path_prefixes?: string[]
  }
  assistant?: {
    /** Name shown and used by the model, per locale or one string. Default "AI Assistant". */
    name?: string | LocaleText
    /** Default greeting per locale (the Admin setting overrides) */
    greeting?: LocaleText
    /** Locales the storefront may ask for. Default ["en"]. The first is the fallback. */
    locales?: string[]
    /** Extra system-prompt text from the developer (the Admin "instructions" setting is appended after it) */
    instructions?: string
  }
  contact?: {
    /** WhatsApp number in international format without "+", e.g. "6281234567890". Required for handoff. */
    whatsapp?: string
    /** Response hours per locale, shown next to the CS button and told to the model */
    hours?: LocaleText
    email?: string
  }
  knowledge?: {
    /**
     * Policy/info pages the model may read through the `get_policy` tool: topic → locale → URL of a markdown or
     * plain-text (or HTML) page. Example: { shipping: { en: "https://store.com/us/shipping/markdown", id: "..." } }
     */
    pages?: Record<string, LocaleText>
    /** Cache lifetime of a fetched page. Default 3600. */
    cache_seconds?: number
    /** Characters of a page given to the model at most. Default 6000. */
    max_chars?: number
  }
  catalog?: {
    /** Products with any of these metadata keys set to true/"true" are never shown. Default ["secret", "hidden"]. */
    hide_when_metadata?: string[]
    /** Search results per call. Default 5 (max 8). */
    search_limit?: number
    /**
     * Language the catalog (titles, descriptions) is written in, e.g. "id". The model is told to retry a failed
     * search with words in that language. Default: the first assistant locale.
     */
    language?: string
    /**
     * Medusa translation locale per assistant locale, e.g. { en: "en-US" }: sent as `locale` to the Store API so
     * translated titles come back. Default: "<locale>-<MARKET COUNTRY>" for a two-letter locale (en + US → en-US).
     */
    translation_locales?: Record<string, string>
    /**
     * When a search finds nothing, this many products are listed (in the customer's locale) and matched by words
     * against title, description, categories, collection and metadata. Default 100; 0 disables.
     */
    fallback_scan?: number
  }
  shipping?: {
    /** Offer the `shipping_estimate` tool (needs medusa-fulfillment-zone-rate). Default true; off automatically when the route is missing. */
    enabled?: boolean
  }
  limits?: {
    max_message_chars?: number // default 1000
    max_turns?: number // default 20 (assistant answers per session)
    /** Messages kept verbatim in the prompt; older ones are summarised. Default 12. */
    history_messages?: number
    /** Summarise older turns once the last prompt was larger than this. Default 8000. */
    summarize_after_tokens?: number
    /** Never send a prompt estimated above this (Haiku 5.5 prices rise 5× above 100k). Default 30000. */
    max_prompt_tokens?: number
    max_output_tokens?: number // default 700
    /** Tool calls per answer at most. Default 4. */
    max_tool_rounds?: number
    per_ip?: { hour?: number; day?: number } // default 30 / 100
    /** Messages per session per minute. Default 6. */
    per_session_minute?: number
  }
  budget?: {
    /** USD per day across all visitors; the Admin setting overrides. Default 1. */
    daily_usd?: number
    /** IANA zone the day is counted in. Default "UTC". */
    timezone?: string
  }
  /** Days a conversation is kept. Default 30. */
  retention_days?: number
  feed?: {
    /** Post a notification to the Admin bell when a chat is handed over. Default true. */
    enabled?: boolean
    channel?: string // default "feed"
    template?: string // default "admin-ui"
    /** Admin URL for the link in the notification, e.g. https://api.store.com/app */
    admin_url?: string
  }
  /** Base URL this server answers Store API calls on (tools call it). Default http://127.0.0.1:${PORT || 9000}. */
  backend_url?: string
  /** Where tool calls to the own Store API are timed out (seconds). Default 8. */
  tool_timeout_seconds?: number
  privacy?: {
    /** Salt for IP hashes. Default: derived from the JWT secret. */
    ip_salt?: string
  }
  /** Show a small "by Haus Kayu" credit under the Admin page. Default false. */
  showCredit?: boolean
}

export type ResolvedOptions = {
  provider: { id: ProviderId; model: string; api_key_env: string; base_url: string | null; effort: "low" | "medium" | "high"; timeout_ms: number }
  pricing: Pricing | null
  store: { name: string; description: string; location: string }
  storefront: { url: string; product_path: string; custom_path: string | null; privacy_path: string; path_prefixes: string[] }
  assistant: { name: LocaleText; greeting: LocaleText; locales: string[]; instructions: string }
  contact: { whatsapp: string | null; hours: LocaleText; email: string | null }
  knowledge: { pages: Record<string, LocaleText>; cache_seconds: number; max_chars: number }
  catalog: { hide_when_metadata: string[]; search_limit: number; language: string; translation_locales: Record<string, string>; fallback_scan: number }
  shipping: { enabled: boolean }
  limits: {
    max_message_chars: number
    max_turns: number
    history_messages: number
    summarize_after_tokens: number
    max_prompt_tokens: number
    max_output_tokens: number
    max_tool_rounds: number
    per_ip: { hour: number; day: number }
    per_session_minute: number
  }
  budget: { daily_usd: number; timezone: string }
  retention_days: number
  feed: { enabled: boolean; channel: string; template: string; admin_url: string | null }
  backend_url: string
  tool_timeout_ms: number
  privacy: { ip_salt: string }
  showCredit: boolean
}

/** Published Anthropic prices (USD per MTok, prompts up to 100k tokens), 20 Nov 2026 */
export const KNOWN_PRICING: Record<string, Pricing> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cache_read: 0.1, cache_write: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cache_read: 0.2, cache_write: 5 },
  "claude-haiku-4-5": { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 },
  mock: { input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125 },
}

const num = (v: unknown, fallback: number, min = 0, max = Number.POSITIVE_INFINITY) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback
  return Math.min(max, Math.max(min, n))
}
const str = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback)
const localeText = (v: unknown, fallback: LocaleText = {}): LocaleText => {
  if (typeof v === "string") return { "*": v }
  if (v && typeof v === "object") {
    const out: LocaleText = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === "string") out[k] = val
    return out
  }
  return fallback
}

export function resolvePricing(model: string, given: Partial<Pricing> | undefined): Pricing | null {
  const known = KNOWN_PRICING[model] ?? null
  if (!given) return known
  const base = known ?? { input: 0, output: 0, cache_read: 0, cache_write: 0 }
  const p = { ...base, ...Object.fromEntries(Object.entries(given).filter(([, v]) => typeof v === "number" && v >= 0)) } as Pricing
  return p
}

export function resolveOptions(raw: PluginOptions | undefined, secret: string): ResolvedOptions {
  const o = raw ?? {}
  const pr = o.provider ?? {}
  const id: ProviderId = pr.id === "openai" || pr.id === "mock" ? pr.id : "anthropic"
  const model = str(pr.model, id === "anthropic" ? "claude-haiku-5-5" : id === "mock" ? "mock" : "")
  const locales = Array.isArray(o.assistant?.locales) && o.assistant.locales.length ? o.assistant.locales.map((l) => String(l).toLowerCase()) : ["en"]
  const lim = o.limits ?? {}
  const sf = o.storefront ?? {}
  const prefixes = Array.isArray(sf.path_prefixes) && sf.path_prefixes.length ? sf.path_prefixes.map(String) : [""]
  return {
    provider: {
      id,
      model,
      api_key_env: str(pr.api_key_env, "AI_CHAT_API_KEY"),
      base_url: typeof pr.base_url === "string" && pr.base_url ? pr.base_url.replace(/\/+$/, "") : null,
      effort: pr.effort === "medium" || pr.effort === "high" ? pr.effort : "low",
      timeout_ms: num(pr.timeout_seconds, 60, 5, 600) * 1000,
    },
    pricing: resolvePricing(model, o.pricing),
    store: { name: str(o.store?.name, "our store"), description: str(o.store?.description, ""), location: str(o.store?.location, "") },
    storefront: {
      url: str(sf.url, "").replace(/\/+$/, ""),
      product_path: str(sf.product_path, "/products/{handle}"),
      custom_path: typeof sf.custom_path === "string" && sf.custom_path ? sf.custom_path : null,
      privacy_path: str(sf.privacy_path, "/privacy"),
      path_prefixes: prefixes.includes("") ? prefixes : ["", ...prefixes],
    },
    assistant: {
      name: localeText(o.assistant?.name, { "*": "AI Assistant" }),
      greeting: localeText(o.assistant?.greeting),
      locales,
      instructions: str(o.assistant?.instructions, ""),
    },
    contact: {
      whatsapp: typeof o.contact?.whatsapp === "string" && /^\d{6,16}$/.test(o.contact.whatsapp) ? o.contact.whatsapp : null,
      hours: localeText(o.contact?.hours),
      email: str(o.contact?.email, "") || null,
    },
    knowledge: {
      pages: Object.fromEntries(Object.entries(o.knowledge?.pages ?? {}).map(([topic, v]) => [topic.toLowerCase().replace(/[^a-z0-9_-]/g, ""), localeText(v)])),
      cache_seconds: num(o.knowledge?.cache_seconds, 3600, 0),
      max_chars: num(o.knowledge?.max_chars, 6000, 500, 40000),
    },
    catalog: {
      hide_when_metadata: Array.isArray(o.catalog?.hide_when_metadata) ? o.catalog.hide_when_metadata.map(String) : ["secret", "hidden"],
      search_limit: num(o.catalog?.search_limit, 5, 1, 8),
      language: typeof o.catalog?.language === "string" && o.catalog.language.trim() ? o.catalog.language.trim().toLowerCase() : locales[0],
      translation_locales: Object.fromEntries(Object.entries(o.catalog?.translation_locales ?? {}).filter(([k, v]) => typeof v === "string" && v.trim()).map(([k, v]) => [k.toLowerCase(), (v as string).trim()])),
      fallback_scan: num(o.catalog?.fallback_scan, 100, 0, 500),
    },
    shipping: { enabled: o.shipping?.enabled !== false },
    limits: {
      max_message_chars: num(lim.max_message_chars, 1000, 50, 10000),
      max_turns: num(lim.max_turns, 20, 1, 500),
      history_messages: num(lim.history_messages, 12, 2, 100),
      summarize_after_tokens: num(lim.summarize_after_tokens, 8000, 1000),
      max_prompt_tokens: num(lim.max_prompt_tokens, 30000, 2000, 100000),
      max_output_tokens: num(lim.max_output_tokens, 700, 100, 8000),
      max_tool_rounds: num(lim.max_tool_rounds, 4, 0, 10),
      per_ip: { hour: num(lim.per_ip?.hour, 30, 0), day: num(lim.per_ip?.day, 100, 0) },
      per_session_minute: num(lim.per_session_minute, 6, 0),
    },
    budget: { daily_usd: num(o.budget?.daily_usd, 1, 0), timezone: str(o.budget?.timezone, "UTC") },
    retention_days: num(o.retention_days, 30, 1, 3650),
    feed: {
      enabled: o.feed?.enabled !== false,
      channel: str(o.feed?.channel, "feed"),
      template: str(o.feed?.template, "admin-ui"),
      admin_url: str(o.feed?.admin_url, "").replace(/\/+$/, "") || null,
    },
    backend_url: str(o.backend_url, `http://127.0.0.1:${process.env.PORT || 9000}`).replace(/\/+$/, ""),
    tool_timeout_ms: num(o.tool_timeout_seconds, 8, 1, 60) * 1000,
    privacy: { ip_salt: str(o.privacy?.ip_salt, secret) },
    showCredit: o.showCredit === true,
  }
}

/** Text for a locale from a per-locale map: exact, language part, "*", first locale of the plugin, first value */
export function pick(text: LocaleText | undefined, locale: string, fallbackLocale?: string): string {
  if (!text) return ""
  const lang = locale.split("-")[0]
  return text[locale] ?? text[lang] ?? text["*"] ?? (fallbackLocale ? text[fallbackLocale] : undefined) ?? Object.values(text)[0] ?? ""
}

type Entry = string | { resolve?: unknown; options?: unknown }

function packageNameAt(dir: string): string | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).name ?? null
  } catch {
    return null
  }
}

/** A resolve string that points at this package: its name, a sub-path of it, or a local path to it */
export function isThisPackage(resolve: string): boolean {
  const r = resolve.replace(/\/+$/, "")
  if (r === PACKAGE_NAME || r.startsWith(`${PACKAGE_NAME}/`) || r.includes(`/${PACKAGE_NAME}`)) return true
  if (r.startsWith(".") || path.isAbsolute(r)) {
    for (let dir = path.resolve(r), i = 0; i < 6; i++, dir = path.dirname(dir)) {
      if (packageNameAt(dir) === PACKAGE_NAME) return true
    }
  }
  return false
}

const cache = new WeakMap<object, ResolvedOptions>()

/** The plugin's options (`plugins: [{ resolve, options }]`) with defaults applied; cached per container. */
export function getOptions(container: MedusaContainer): ResolvedOptions {
  const config: ConfigModule = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const hit = cache.get(config)
  if (hit) return hit
  let raw: PluginOptions | undefined
  for (const p of (config.plugins ?? []) as Entry[]) {
    const resolve = typeof p === "string" ? p : p.resolve
    if (typeof resolve === "string" && isThisPackage(resolve)) {
      raw = typeof p === "string" ? {} : ((p.options as PluginOptions) ?? {})
      break
    }
  }
  const jwt = config.projectConfig?.http?.jwtSecret
  const resolved = resolveOptions(raw, (typeof jwt === "string" && jwt) || PACKAGE_NAME)
  cache.set(config, resolved)
  return resolved
}
