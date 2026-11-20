import { resolveOptions } from "../options"
import { buildSystem } from "../prompt"

const options = resolveOptions(
  { store: { name: "Haus Kayu", location: "Jepara, Indonesia" }, storefront: { url: "https://hauskayu.com", custom_path: "/custom" }, contact: { whatsapp: "6285111663330", hours: { id: "Setiap hari 08.00–21.00 WIB", en: "Every day 8am–9pm WIB" } }, assistant: { name: { id: "Asisten AI Haus Kayu", en: "Haus Kayu AI Assistant" }, locales: ["id", "en"] } },
  "s"
)
const settings = { id: "x", enabled: true, greeting: {}, instructions: "Sapa dengan Kak.", faqs: [{ id: "1", question: "Bisa COD?", answer: "Belum bisa.", locale: "id" }, { id: "2", question: "Do you ship abroad?", answer: "Yes.", locale: "en" }], daily_budget_usd: null, updated_at: null }
const session = { id: "acs_1", locale: "id", country_code: "id", region_id: null, currency_code: "idr", path_prefix: "" }

describe("system prompt", () => {
  const p = buildSystem({ options, settings, session, summary: "Pelanggan cari talenan.", page: "/products/talenan", tools: ["search_products", "get_product", "shipping_estimate", "get_policy", "handoff_to_cs"], turnsLeft: 10 })
  it("states identity, language, hard rules and tools in the stable part", () => {
    expect(p.stable).toContain('You are "Asisten AI Haus Kayu"')
    expect(p.stable).toContain("Write in Indonesian (Bahasa Indonesia)")
    expect(p.stable).toContain("Never state, estimate, round or infer an amount")
    expect(p.stable).toContain("Never ask for or accept payment details")
    expect(p.stable).toContain("<customer_message>")
    expect(p.stable).toContain("https://hauskayu.com/custom")
    expect(p.stable).toContain("CS response hours: Setiap hari 08.00–21.00 WIB")
  })
  it("includes only the FAQ of the visitor's language and the merchant instructions", () => {
    expect(p.stable).toContain("Q: Bisa COD?")
    expect(p.stable).not.toContain("ship abroad")
    expect(p.stable).toContain("Sapa dengan Kak.")
  })
  it("keeps per-visitor facts in the dynamic part", () => {
    expect(p.dynamic).toContain("market ID")
    expect(p.dynamic).toContain("/products/talenan")
    expect(p.dynamic).toContain("Pelanggan cari talenan.")
    expect(p.stable).not.toContain("/products/talenan")
  })
  it("is stable across visitors of a locale", () => {
    const q = buildSystem({ options, settings, session: { ...session, id: "acs_2" }, summary: null, page: "/", tools: ["search_products", "get_product", "shipping_estimate", "get_policy", "handoff_to_cs"], turnsLeft: 3 })
    expect(q.stable).toBe(p.stable)
    expect(q.dynamic).toContain("3 assistant answer(s) left")
  })
})
