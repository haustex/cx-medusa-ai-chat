import type { AiProvider, CompletionRequest, StreamEvent } from "./types"

const tokens = (s: string) => Math.ceil(s.length / 4)

const EN = {
  onRequest: "price on request",
  one: (title: string, price: string) => `Yes, we have the ${title}: ${price}. It is hand-finished teak from Jepara and food-safe. Want me to check shipping to your address?`,
  many: (items: string[]) => `Here is what matches: ${items.join("; ")}. Tell me which one you like and I will give you the details.`,
  none: "I could not find a product like that in our catalog. Our team on WhatsApp can tell you whether we can make it to order.",
  costs: (title: string, price: string) => `${title} costs ${price}.`,
  shipping: (name: string, rate: string, est: string) => `Shipping via ${name}: ${rate} per kg, ${est}.`,
  noShipping: "No shipping service covers that destination; please ask our team on WhatsApp.",
  policy: (topic: string, text: string) => `From our ${topic} page: ${text}`,
  handoff: "I have prepared a WhatsApp handover for you; tap the button to continue with our team.",
  scope: "I can only help with our products, shipping and policies.",
  whoami: "I am the store's AI assistant, not a person. For anything I cannot answer, our team is one tap away on WhatsApp.",
  fallback: "I am not sure about that one. I can look up products, prices, shipping and our policies, or you can ask our team on WhatsApp.",
}
const ID: typeof EN = {
  onRequest: "harga sesuai permintaan",
  one: (title, price) => `Ada, Kak. ${title}: ${price}. Dibuat dari kayu jati Jepara, finishing aman untuk makanan. Mau sekalian saya cek ongkir ke alamat Kakak?`,
  many: (items) => `Ini yang cocok: ${items.join("; ")}. Kakak tertarik yang mana? Nanti saya jelaskan detailnya.`,
  none: "Produk seperti itu belum ada di katalog kami. Tim CS di WhatsApp bisa cek apakah bisa dibuat custom.",
  costs: (title, price) => `${title} harganya ${price}.`,
  shipping: (name, rate, est) => `Kirim via ${name}: ${rate} per kg, ${est}.`,
  noShipping: "Belum ada layanan kirim ke tujuan itu; silakan tanya tim CS di WhatsApp.",
  policy: (topic, text) => `Dari halaman ${topic} kami: ${text}`,
  handoff: "Saya sudah siapkan pesan ke WhatsApp CS; tinggal tekan tombolnya untuk lanjut dengan tim kami.",
  scope: "Saya hanya bisa bantu soal produk, pengiriman, dan kebijakan toko.",
  whoami: "Saya asisten AI toko ini, bukan manusia. Untuk hal yang tidak bisa saya jawab, tim CS siap bantu lewat WhatsApp.",
  fallback: "Yang itu saya belum yakin. Saya bisa cek produk, harga, ongkir, dan kebijakan toko, atau Kakak bisa tanya tim CS di WhatsApp.",
}

/**
 * Deterministic stand-in for tests and demos: reacts to keywords in the last customer message. "ngarang" / "fake
 * price" makes it state a price that no tool returned, so the amount guard can be exercised end to end.
 */
export class MockProvider implements AiProvider {
  readonly id = "mock"
  readonly model = "mock"
  private counter = 0

  async *stream(req: CompletionRequest): AsyncIterable<StreamEvent> {
    const last = req.messages[req.messages.length - 1]
    // The prompt's "Write in <language>" line decides the demo language (Indonesian or English)
    const id = /Write in Indonesian/.test(req.system.dynamic) || /Write in Indonesian/.test(req.system.stable)
    const L = id ? ID : EN
    const promptChars = JSON.stringify(req.messages).length + req.system.stable.length + req.system.dynamic.length
    const usage = (out: string) => ({ input_tokens: tokens(String(promptChars)) + 50, output_tokens: tokens(out), cache_read_tokens: tokens(req.system.stable), cache_write_tokens: 0 })
    const say = async function* (text: string): AsyncIterable<StreamEvent> {
      for (const piece of text.match(/.{1,12}/gs) ?? []) yield { type: "text", text: piece }
      yield { type: "done", stop_reason: "end_turn", usage: usage(text) }
    }
    const call = async function* (this: MockProvider, name: string, input: unknown): AsyncIterable<StreamEvent> {
      yield { type: "tool_use", id: `mock_${++this.counter}`, name, input }
      yield { type: "done", stop_reason: "tool_use", usage: usage(JSON.stringify(input)) }
    }.bind(this)

    // A tool result came back: answer from it
    if (last && typeof last.content !== "string" && last.content.some((p) => p.type === "tool_result")) {
      const result = last.content.find((p) => p.type === "tool_result") as { content: string }
      let data: Record<string, unknown> = {}
      try {
        data = JSON.parse(result.content)
      } catch {}
      const products = data.products as { title: string; price?: { formatted?: string }; url?: string }[] | undefined
      if (products?.length) {
        yield* say(products.length === 1 ? L.one(products[0].title, products[0].price?.formatted ?? L.onRequest) : L.many(products.map((p) => `${p.title} (${p.price?.formatted ?? "-"})`)))
        return
      }
      if (Array.isArray(products) && !products.length) {
        yield* say(L.none)
        return
      }
      if (data.product) {
        const p = data.product as { title: string; price?: { formatted?: string } }
        yield* say(L.costs(p.title, p.price?.formatted ?? "-"))
        return
      }
      if (Array.isArray(data.services)) {
        const s = data.services as { name: string; rate_per_kg_formatted?: string; estimate_text?: string }[]
        yield* say(s.length ? L.shipping(s[0].name, s[0].rate_per_kg_formatted ?? "-", s[0].estimate_text ?? "") : L.noShipping)
        return
      }
      if (typeof data.text === "string") {
        yield* say(L.policy(String(data.topic ?? "policy"), String(data.text).slice(0, 160)))
        return
      }
      if (data.whatsapp_url) {
        yield* say(L.handoff)
        return
      }
      yield* say(`Tool answered: ${result.content.slice(0, 120)}`)
      return
    }

    const raw = typeof last?.content === "string" ? last.content : (last?.content ?? []).map((p) => (p.type === "text" ? p.text : "")).join(" ")
    const text = raw.replace(/<\/?customer_message>/g, "").trim().toLowerCase()
    const tool = (name: string) => req.tools.some((t) => t.name === name)
    if (/ngarang|fake price/.test(text)) {
      yield* say("Harganya Rp123.456 saja, diskon 50% kalau beli hari ini!")
      return
    }
    if (/\b(ignore|abaikan)\b.*\b(instruction|instruksi)/.test(text)) {
      yield* say(L.scope)
      return
    }
    if (tool("handoff_to_cs") && /komplain|complain|refund|nego|custom order/.test(text)) {
      yield* call("handoff_to_cs", { reason: /refund/.test(text) ? "refund" : /nego/.test(text) ? "price_negotiation" : /custom/.test(text) ? "custom_order" : "complaint", summary: "Customer wants to talk to a person about: " + text.slice(0, 80) })
      return
    }
    if (tool("shipping_estimate") && /ongkir|shipping cost|kirim ke|ship to/.test(text)) {
      const m = text.match(/(?:ke|to)\s+([a-z ]{3,30})/)
      yield* call("shipping_estimate", { destination: m?.[1]?.trim() ?? "", weight_kg: 2 })
      return
    }
    if (tool("get_policy") && /retur|return|pengembalian|privasi|privacy|kebijakan|policy|garansi/.test(text)) {
      yield* call("get_policy", { topic: /privasi|privacy/.test(text) ? "privacy" : "returns" })
      return
    }
    if (tool("get_product") && /detail (of|dari) ([a-z0-9-]+)/.test(text)) {
      yield* call("get_product", { handle: text.match(/detail (?:of|dari) ([a-z0-9-]+)/)![1] })
      return
    }
    if (tool("search_products") && /cari|search|find|ada |board|talenan|tray|mangkuk|bowl/.test(text)) {
      const kw = text.match(/talenan|nampan|tray|mangkuk|bowl|board|vase|mug|lamp/)?.[0]
      const q = kw ?? (text.replace(/.*?(cari|search|find)\s+/, "").replace(/[?.!]/g, "").trim() || text)
      yield* call("search_products", { query: q.slice(0, 40) })
      return
    }
    if (/siapa kamu|who are you|kamu manusia|are you human/.test(text)) {
      yield* say(L.whoami)
      return
    }
    yield* say(L.fallback)
  }
}
