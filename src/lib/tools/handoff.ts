import { AI_CHAT_MODULE } from "../../modules/ai-chat"
import type AiChatModuleService from "../../modules/ai-chat/service"
import { pushFeed } from "../feed"
import { pick } from "../options"
import { addUsage, dayKey } from "../usage"
import { handoffMessage, whatsappUrl } from "../whatsapp"
import type { Handoff, ProductCard, ToolContext } from "./context"
import { HANDOFF_REASONS, type HandoffReason } from "./definitions"

const LABELS: Record<HandoffReason, string> = {
  complaint: "Komplain / complaint",
  refund: "Refund / pengembalian",
  price_negotiation: "Nego harga / price",
  custom_order: "Custom order",
  cannot_answer: "AI tidak bisa jawab",
  customer_request: "Minta CS",
  order_status: "Status pesanan",
  other: "Lainnya",
}

/**
 * Marks the session handed over, prepares the WhatsApp link and tells the Admin feed. Called by the assistant
 * (tool) or by the CS button in the storefront (source "button"). Idempotent per session for the feed.
 */
export async function handoffToCs(ctx: ToolContext, input: { reason: string; summary: string | null; source: "ai" | "button"; products?: ProductCard[] }): Promise<Handoff> {
  const number = ctx.options.contact.whatsapp
  if (!number) throw new Error("contact.whatsapp is not configured")
  const reason = (HANDOFF_REASONS as readonly string[]).includes(input.reason) ? (input.reason as HandoffReason) : "other"
  const service = ctx.container.resolve<AiChatModuleService>(AI_CHAT_MODULE)
  // Products of this turn first, then the cards of earlier answers
  const seen = new Map<string, ProductCard>()
  for (const p of [...(input.products ?? []), ...ctx.products.values()]) if (!seen.has(p.handle)) seen.set(p.handle, p)
  if (seen.size < 4) {
    const earlier = await service.listChatMessages({ session_id: ctx.session.id, role: "assistant" }, { order: { created_at: "DESC" }, take: 10, select: ["id", "products"] })
    for (const m of earlier) for (const p of (m.products as unknown as ProductCard[] | null) ?? []) if (!seen.has(p.handle)) seen.set(p.handle, p)
  }
  const products = [...seen.values()].slice(0, 4).map((p) => ({ title: p.title, url: p.url }))
  const message = handoffMessage({ locale: ctx.session.locale, storeName: ctx.options.store.name, sessionId: ctx.session.id, summary: input.summary, products, whatsapp: number })
  const url = whatsappUrl(number, message)
  const [session] = await service.listChatSessions({ id: ctx.session.id }, { take: 1 })
  const first = !session?.handoff_at
  await service.updateChatSessions({ id: ctx.session.id, handoff_at: new Date(), handoff_reason: reason, handoff_source: input.source })
  if (first) {
    await addUsage(ctx.container, dayKey(ctx.options.budget.timezone), { handoffs: 1 }).catch(() => undefined)
    const title = `${pick(ctx.options.assistant.name, "id", ctx.options.assistant.locales[0]) || "AI chat"}: oper ke WhatsApp (${LABELS[reason]})`
    const lines = [input.summary ? input.summary.slice(0, 300) : null, products.length ? `Produk: ${products.map((p) => p.title).join(", ")}` : null, `Sumber: ${input.source === "ai" ? "tawaran AI" : "tombol CS"} · ${ctx.session.locale.toUpperCase()}`]
    await pushFeed(ctx.container, ctx.options, { key: `handoff:${ctx.session.id}`, title, description: lines.filter(Boolean).join("\n"), session_id: ctx.session.id })
  }
  ctx.handoff = { url, reason, message, source: input.source }
  return ctx.handoff
}
