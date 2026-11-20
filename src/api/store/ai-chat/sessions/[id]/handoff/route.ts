import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { AI_CHAT_MODULE } from "../../../../../../modules/ai-chat"
import type AiChatModuleService from "../../../../../../modules/ai-chat/service"
import { noStore, publishableKey } from "../../../../../../lib/http"
import { getOptions } from "../../../../../../lib/options"
import { authorizeSession } from "../../../../../../lib/sessions"
import { ToolContext, type ProductCard } from "../../../../../../lib/tools"
import { handoffToCs } from "../../../../../../lib/tools/handoff"
import type { StoreHandoffType } from "../../../../../validators"

/** The visitor pressed "Chat with CS": the WhatsApp link with the conversation summary, recorded and fed to the Admin. */
export const POST = async (req: MedusaRequest<StoreHandoffType>, res: MedusaResponse) => {
  noStore(res)
  const o = getOptions(req.scope)
  if (!o.contact.whatsapp) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "WhatsApp is not configured", "NO_WHATSAPP")
  const session = await authorizeSession(req.scope, req.params.id, req.validatedBody.token)
  const s = req.scope.resolve<AiChatModuleService>(AI_CHAT_MODULE)
  const messages = await s.listChatMessages({ session_id: session.id }, { order: { created_at: "DESC" }, take: 6 })
  const products: ProductCard[] = []
  for (const m of messages) for (const p of (m.products as ProductCard[] | null) ?? []) if (!products.some((x) => x.handle === p.handle)) products.push(p)
  const lastUser = messages.find((m) => m.role === "user")?.content ?? null
  const summary = session.summary ? session.summary : lastUser ? (session.locale === "id" ? `Pertanyaan terakhir: ${lastUser}` : `Last question: ${lastUser}`) : null
  const ctx = new ToolContext(req.scope, o, req.scope.resolve(ContainerRegistrationKeys.LOGGER), { id: session.id, locale: session.locale, country_code: session.country_code, region_id: session.region_id, currency_code: session.currency_code, path_prefix: session.path_prefix ?? "" }, publishableKey(req))
  const h = await handoffToCs(ctx, { reason: "customer_request", summary: summary?.slice(0, 400) ?? null, source: "button", products })
  res.json({ handoff: { url: h.url, message: h.message, whatsapp: o.contact.whatsapp } })
}
