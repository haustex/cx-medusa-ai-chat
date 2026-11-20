import { handoffMessage, whatsappUrl } from "../whatsapp"

describe("handoff message", () => {
  const base = { storeName: "Haus Kayu", sessionId: "acs_01ABCDEFGHIJKLMNOP", whatsapp: "6285111663330", products: [{ title: "Talenan Jati", url: "https://hauskayu.com/products/talenan-jati" }] }
  it("is greeting, summary, product links and chat id in Indonesian", () => {
    const m = handoffMessage({ ...base, locale: "id", summary: "Mau komplain talenan retak" })
    expect(m.split("\n")).toEqual([
      "Halo Haus Kayu, saya tadi ngobrol dengan asisten AI di website.",
      "Ringkasan: Mau komplain talenan retak",
      "Produk yang dibahas:",
      "- Talenan Jati https://hauskayu.com/products/talenan-jati",
      "ID chat: 01ABCDEFGH",
    ])
  })
  it("has an English variant and encodes the URL", () => {
    const m = handoffMessage({ ...base, locale: "en", summary: null, products: [] })
    expect(m).toBe("Hello Haus Kayu, I was chatting with the AI assistant on your website.\nChat ID: 01ABCDEFGH")
    expect(whatsappUrl("6285111663330", m)).toBe(`https://wa.me/6285111663330?text=${encodeURIComponent(m)}`)
  })
  it("never exceeds 1500 characters", () => {
    expect(handoffMessage({ ...base, locale: "id", summary: "x".repeat(5000) }).length).toBeLessThanOrEqual(1500)
  })
})
