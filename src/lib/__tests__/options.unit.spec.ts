import { isThisPackage, pick, resolveOptions, resolvePricing } from "../options"

describe("options", () => {
  it("applies defaults", () => {
    const o = resolveOptions(undefined, "secret")
    expect(o.provider).toMatchObject({ id: "anthropic", model: "claude-haiku-5-5", api_key_env: "AI_CHAT_API_KEY", effort: "low" })
    expect(o.pricing).toEqual({ input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125 })
    expect(o.budget).toEqual({ daily_usd: 1, timezone: "UTC" })
    expect(o.limits.max_prompt_tokens).toBe(30000)
    expect(o.assistant.locales).toEqual(["en"])
    expect(o.storefront.path_prefixes).toEqual([""])
    expect(o.contact.whatsapp).toBeNull()
  })
  it("keeps valid values and clamps the rest", () => {
    const o = resolveOptions({ provider: { id: "openai", model: "gpt-x", base_url: "https://api.example.com/v1/" }, pricing: { input: 1, output: 2 }, contact: { whatsapp: "6285111663330" }, limits: { max_turns: 0, per_ip: { hour: 5 } }, storefront: { path_prefixes: ["/us"] }, assistant: { locales: ["id", "en"] } }, "s")
    expect(o.provider.base_url).toBe("https://api.example.com/v1")
    expect(o.pricing).toEqual({ input: 1, output: 2, cache_read: 0, cache_write: 0 })
    expect(o.contact.whatsapp).toBe("6285111663330")
    expect(o.limits.max_turns).toBe(1)
    expect(o.limits.per_ip).toEqual({ hour: 5, day: 100 })
    expect(o.storefront.path_prefixes).toEqual(["", "/us"])
    expect(o.assistant.locales).toEqual(["id", "en"])
  })
  it("has no prices for an unknown model unless given", () => {
    expect(resolvePricing("some-model", undefined)).toBeNull()
    expect(resolvePricing("claude-sonnet-5-5", { output: 9 })?.output).toBe(9)
  })
  it("picks locale text", () => {
    expect(pick({ id: "a", en: "b" }, "id-ID")).toBe("a")
    expect(pick({ "*": "x" }, "de")).toBe("x")
    expect(pick({ en: "b" }, "de", "en")).toBe("b")
    expect(pick(undefined, "id")).toBe("")
  })
  it("recognises its own package in resolve strings", () => {
    expect(isThisPackage("medusa-ai-chat")).toBe(true)
    expect(isThisPackage("medusa-ai-chat/something")).toBe(true)
    expect(isThisPackage("medusa-reviews-wishlist")).toBe(false)
  })
})
