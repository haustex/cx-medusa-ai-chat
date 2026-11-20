import type { LocaleText } from "./options"
import { pick } from "./options"

export type HandoffProduct = { title: string; url: string }

export type HandoffInput = {
  locale: string
  storeName: string
  sessionId: string
  summary: string | null
  products: HandoffProduct[]
  whatsapp: string
}

const TEXT: Record<string, LocaleText> = {
  greeting: { id: "Halo {store}, saya tadi ngobrol dengan asisten AI di website.", en: "Hello {store}, I was chatting with the AI assistant on your website." },
  summary: { id: "Ringkasan: {summary}", en: "Summary: {summary}" },
  products: { id: "Produk yang dibahas:", en: "Products discussed:" },
  id: { id: "ID chat: {id}", en: "Chat ID: {id}" },
}

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/[<>]/g, "").trim()

/** The pre-filled WhatsApp message: greeting, short summary, product links, chat id. Never longer than ~1500 chars. */
export function handoffMessage(input: HandoffInput): string {
  const t = (k: string) => pick(TEXT[k], input.locale, "en")
  const lines = [t("greeting").replace("{store}", input.storeName)]
  const summary = input.summary ? clean(input.summary).slice(0, 400) : ""
  if (summary) lines.push(t("summary").replace("{summary}", summary))
  if (input.products.length) {
    lines.push(t("products"))
    for (const p of input.products.slice(0, 4)) lines.push(`- ${clean(p.title)} ${p.url}`)
  }
  lines.push(t("id").replace("{id}", input.sessionId.replace(/^acs_/, "").slice(0, 10).toUpperCase()))
  return lines.join("\n").slice(0, 1500)
}

export const whatsappUrl = (number: string, message: string) => `https://wa.me/${number}?text=${encodeURIComponent(message)}`
