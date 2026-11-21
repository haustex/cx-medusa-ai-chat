import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { budgetStatus, costOf, ipHash, pricingFor, rateLimits, recordUsage, resetFeatureSpend, takeRateLimit } from "../../budget"
import { AI_CHAT_MODULE } from "../../modules/ai-chat"
import { resetRateLimits } from "../rate-limit"

type Row = Record<string, unknown> & { id: string }

function fakeContainer(options: Record<string, unknown>, withCache: boolean) {
  const usages: Row[] = []
  const settings: Row[] = [{ id: "set_1", enabled: true, daily_budget_usd: null, faqs: [] }]
  const store = new Map<string, unknown>()
  const service = {
    listChatUsages: async (f: { day: string }) => usages.filter((u) => u.day === f.day),
    createChatUsages: async (d: Record<string, unknown>) => {
      const row = { id: `u_${usages.length}`, ...d }
      usages.push(row)
      return row
    },
    updateChatUsages: async (d: Row) => Object.assign(usages.find((u) => u.id === d.id)!, d),
    listChatSettings: async () => settings,
    createChatSettings: async (d: Record<string, unknown>) => ({ id: "set_new", ...d }),
  }
  const cache = { get: async (k: string) => (store.has(k) ? store.get(k) : null), set: async (k: string, v: unknown) => void store.set(k, v) }
  const config = { plugins: [{ resolve: "medusa-ai-chat", options }], projectConfig: { http: { jwtSecret: "test-secret" } } }
  const container = {
    resolve: (key: string) => {
      if (key === ContainerRegistrationKeys.CONFIG_MODULE) return config
      if (key === AI_CHAT_MODULE) return service
      if (key === Modules.CACHE && withCache) return cache
      throw new Error(`not registered: ${key}`)
    },
  } as never
  return { container, usages, store }
}

const usage = { input_tokens: 700, output_tokens: 50 }

describe("medusa-ai-chat/budget", () => {
  beforeEach(() => {
    resetFeatureSpend()
    resetRateLimits()
  })

  it("prices calls with the published price list, the pricing option for the assistant's model", () => {
    const { container } = fakeContainer({ provider: { model: "claude-haiku-5-5" } }, false)
    expect(pricingFor(container)).toEqual({ input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125 })
    expect(pricingFor(container, "claude-sonnet-5-5")?.input).toBe(2)
    expect(pricingFor(container, "unknown-model")).toBeNull()
    expect(costOf(usage, pricingFor(container))).toBeCloseTo(0.000095, 9)
    const custom = fakeContainer({ provider: { id: "openai", model: "local", base_url: "http://x" }, pricing: { input: 1, output: 2, cache_read: 0, cache_write: 0 } }, false)
    expect(pricingFor(custom.container)).toEqual({ input: 1, output: 2, cache_read: 0, cache_write: 0 })
  })

  it("records usage in the day's row and a feature counter; the feature stops at its share", async () => {
    const { container, usages, store } = fakeContainer({ budget: { daily_usd: 0.001, timezone: "Asia/Jakarta" } }, true)
    let s = await budgetStatus(container, { feature: "search", share: 0.3 })
    expect(s).toMatchObject({ daily_usd: 0.001, spent_usd: 0, over_budget: false, feature: { name: "search", spent_usd: 0 } })
    expect(s.feature?.cap_usd).toBeCloseTo(0.0003, 9)

    for (let i = 0; i < 3; i++) await recordUsage(container, { usage, model: "claude-haiku-5-5", feature: "search" })
    expect(usages).toHaveLength(1)
    expect(usages[0]).toMatchObject({ input_tokens: 2100, output_tokens: 150 })
    expect(Number(usages[0].cost_usd)).toBeCloseTo(0.000285, 9)
    expect([...store.keys()][0]).toMatch(/^ac:spend:search:\d{4}-\d{2}-\d{2}$/)

    s = await budgetStatus(container, { feature: "search", share: 0.3 })
    expect(s.over_budget).toBe(false)
    await recordUsage(container, { usage, feature: "search" })
    s = await budgetStatus(container, { feature: "search", share: 0.3 })
    expect(s.over_budget).toBe(true)
    // The rest of the day's budget stays for the assistant
    expect((await budgetStatus(container)).over_budget).toBe(false)
    expect((await budgetStatus(container, { feature: "other", share: 0.3 })).over_budget).toBe(false)
  })

  it("is over budget for everyone once the day's total reached the cap; 0 = no cap", async () => {
    const { container } = fakeContainer({ budget: { daily_usd: 0.00009 } }, false)
    await recordUsage(container, { usage })
    expect((await budgetStatus(container, { feature: "search", share: 1 })).over_budget).toBe(true)
    const free = fakeContainer({ budget: { daily_usd: 0 } }, false)
    await recordUsage(free.container, { usage, feature: "search" })
    const s = await budgetStatus(free.container, { feature: "search", share: 0.3 })
    expect(s).toMatchObject({ over_budget: false, feature: { cap_usd: null } })
  })

  it("rejects feature names that could collide with other cache keys", async () => {
    const { container } = fakeContainer({}, false)
    await expect(budgetStatus(container, { feature: "a:b" })).rejects.toThrow(/invalid feature name/)
  })

  it("exposes the assistant's limits, a namespaced rate limiter and the salted IP hash", async () => {
    const { container } = fakeContainer({ limits: { per_ip: { hour: 2, day: 5 } } }, false)
    expect(rateLimits(container)).toEqual({ per_ip: { hour: 2, day: 5 } })
    const hits = [await takeRateLimit(container, "search:h:x", 2, 3600), await takeRateLimit(container, "search:h:x", 2, 3600), await takeRateLimit(container, "search:h:x", 2, 3600)]
    expect(hits).toEqual([true, true, false])
    const h = ipHash(container, "203.0.113.7")
    expect(h).toMatch(/^[0-9a-f]{32}$/)
    expect(h).not.toContain("203")
  })
})
