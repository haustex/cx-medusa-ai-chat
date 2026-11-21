/**
 * Public API for other model calls in the same store (import from "medusa-ai-chat/budget"): a search rewrite, a
 * product-description helper, anything that spends the same model key. They share the assistant's daily budget,
 * show up in its Admin statistics, use its rate limiter and its price list. Everything else under the package is
 * internal and may change in any release.
 *
 * Budget per feature: `recordUsage(container, { usage, model, feature: "search" })` adds the cost to the day's total
 * and to a per-feature counter; `budgetStatus(container, { feature: "search", share: 0.3 })` reports over budget when
 * the day's total reached the budget or that feature spent its share of it. The per-feature counter lives in the
 * Cache Module (Redis in production, memory otherwise) for two days; the total is the persistent `ai_chat_usage` row.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import type { MedusaRequest } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"

import { dailyBudget } from "./lib/chat"
import { clientIp as requestIp } from "./lib/http"
import { getOptions, KNOWN_PRICING, type Pricing } from "./lib/options"
import { take } from "./lib/rate-limit"
import { getSettings } from "./lib/settings"
import { hashIp } from "./lib/tokens"
import { addUsage, costOf as priceUsage, dayKey, usageOfDay } from "./lib/usage"

export type { Pricing }

/** Tokens of one model call, as the provider reports them (cache fields default to 0) */
export type ModelUsage = { input_tokens: number; output_tokens: number; cache_read_tokens?: number; cache_write_tokens?: number }

export type BudgetStatus = {
  /** Calendar day in the budget time zone, YYYY-MM-DD */
  day: string
  timezone: string
  /** Daily cap in USD (Admin setting, else the `budget.daily_usd` option); 0 = no cap */
  daily_usd: number
  /** Spent today by the assistant and every caller of `recordUsage` */
  spent_usd: number
  /** The feature's own spend today and its cap (`share` × `daily_usd`); null without `feature` */
  feature: { name: string; spent_usd: number; cap_usd: number | null } | null
  /** True when the day's total reached the cap, or the feature reached its share */
  over_budget: boolean
}

type CacheLike = { get<T>(key: string): Promise<T | null>; set(key: string, data: unknown, ttl?: number): Promise<void> }
const memory = new Map<string, number>()

function cacheOf(container: MedusaContainer): CacheLike | null {
  try {
    const c = container.resolve(Modules.CACHE) as Partial<CacheLike> | undefined
    return c && typeof c.get === "function" && typeof c.set === "function" ? (c as CacheLike) : null
  } catch {
    return null
  }
}

const FEATURE_TTL_SECONDS = 2 * 86_400
const featureKey = (feature: string, day: string) => `ac:spend:${feature}:${day}`

async function featureSpent(container: MedusaContainer, key: string): Promise<number> {
  const cache = cacheOf(container)
  return Number((cache ? await cache.get<number>(key) : memory.get(key)) ?? 0)
}

const cleanFeature = (feature: string) => {
  const f = feature.trim().toLowerCase()
  if (!/^[a-z0-9_-]{1,40}$/.test(f)) throw new MedusaError(MedusaError.Types.INVALID_DATA, `medusa-ai-chat: invalid feature name "${feature}" (a-z, 0-9, _ and -, at most 40)`)
  return f
}

/** USD per million tokens for a model: the `pricing` option for the assistant's own model, else published prices */
export function pricingFor(container: MedusaContainer, model?: string): Pricing | null {
  const o = getOptions(container)
  const m = model ?? o.provider.model
  if (m === o.provider.model && o.pricing) return o.pricing
  return KNOWN_PRICING[m] ?? null
}

/** USD for one call at a price list; 0 without prices */
export function costOf(usage: ModelUsage, pricing: Pricing | null): number {
  return priceUsage({ input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cache_read_tokens: usage.cache_read_tokens ?? 0, cache_write_tokens: usage.cache_write_tokens ?? 0 }, pricing)
}

/**
 * Today's budget. With `feature` and `share` (0–1), the feature is over budget once it spent `share` of the daily
 * cap, even when the total is below it, so the assistant keeps the rest.
 */
export async function budgetStatus(container: MedusaContainer, input: { feature?: string; share?: number } = {}): Promise<BudgetStatus> {
  const o = getOptions(container)
  const settings = await getSettings(container)
  const daily = dailyBudget(o, settings)
  const day = dayKey(o.budget.timezone)
  const row = await usageOfDay(container, day)
  const spent = Number(row?.cost_usd ?? 0)
  let feature: BudgetStatus["feature"] = null
  if (input.feature) {
    const name = cleanFeature(input.feature)
    const share = input.share === undefined ? null : Math.min(1, Math.max(0, input.share))
    feature = { name, spent_usd: await featureSpent(container, featureKey(name, day)), cap_usd: share === null || daily <= 0 ? null : daily * share }
  }
  const totalOver = daily > 0 && spent >= daily
  const featureOver = !!feature && feature.cap_usd !== null && feature.spent_usd >= feature.cap_usd
  return { day, timezone: o.budget.timezone, daily_usd: daily, spent_usd: spent, feature, over_budget: totalOver || featureOver }
}

/**
 * Adds one call to today's usage row (Admin statistics and the daily cap) and, with `feature`, to that feature's
 * counter. Returns the cost in USD. Unknown model without prices: tokens are counted, cost 0.
 */
export async function recordUsage(container: MedusaContainer, input: { usage: ModelUsage; model?: string; feature?: string }): Promise<number> {
  const o = getOptions(container)
  const day = dayKey(o.budget.timezone)
  const u = input.usage
  const cost = costOf(u, pricingFor(container, input.model))
  await addUsage(container, day, {
    cost_usd: cost,
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_read_tokens: u.cache_read_tokens ?? 0,
    cache_write_tokens: u.cache_write_tokens ?? 0,
  })
  if (input.feature && cost > 0) {
    const key = featureKey(cleanFeature(input.feature), day)
    const next = Math.round(((await featureSpent(container, key)) + cost) * 1e9) / 1e9
    const cache = cacheOf(container)
    if (cache) await cache.set(key, next, FEATURE_TTL_SECONDS)
    else memory.set(key, next)
  }
  return cost
}

/** The assistant's per-IP limits (`limits.per_ip`), for callers that want the same numbers */
export function rateLimits(container: MedusaContainer): { per_ip: { hour: number; day: number } } {
  const { per_ip } = getOptions(container).limits
  return { per_ip: { ...per_ip } }
}

/**
 * Fixed-window counter shared through the Cache Module. Returns false, without counting, once `max` calls were made
 * in the window. `key` is namespaced by the caller ("search:h:<ip hash>"); max ≤ 0 = no limit.
 */
export function takeRateLimit(container: MedusaContainer, key: string, max: number, windowSeconds: number): Promise<boolean> {
  return take(container, `ext:${key}`, max, windowSeconds)
}

/** The visitor's address: Cloudflare's header, then Express (trust proxy), then the socket */
export const clientIp = (req: MedusaRequest): string => requestIp(req)

/** Salted hash of an address (the assistant's `privacy.ip_salt`), for rate-limit keys that never store the IP */
export function ipHash(container: MedusaContainer, ip: string): string {
  return hashIp(ip, getOptions(container).privacy.ip_salt)
}

/** For tests: forget the in-memory feature counters (the Cache Module is not touched) */
export const resetFeatureSpend = () => memory.clear()
