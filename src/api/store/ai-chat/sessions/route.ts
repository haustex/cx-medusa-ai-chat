import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { AI_CHAT_MODULE } from "../../../../modules/ai-chat"
import type AiChatModuleService from "../../../../modules/ai-chat/service"
import { clientIpHash, noStore } from "../../../../lib/http"
import { getOptions } from "../../../../lib/options"
import { providerReady } from "../../../../lib/providers"
import { take } from "../../../../lib/rate-limit"
import { cleanPage } from "../../../../lib/sessions"
import { getSettings } from "../../../../lib/settings"
import { hashToken, newToken } from "../../../../lib/tokens"
import { addUsage, dayKey } from "../../../../lib/usage"
import type { StoreCreateSessionType } from "../../../validators"

/** Starts a conversation after the visitor accepted the privacy notice (`consent: true`). Returns the id and token. */
export const POST = async (req: MedusaRequest<StoreCreateSessionType>, res: MedusaResponse) => {
  noStore(res)
  const o = getOptions(req.scope)
  const settings = await getSettings(req.scope)
  if (!settings.enabled || !providerReady(req.scope)) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The assistant is switched off", "AI_CHAT_DISABLED")
  const ip = clientIpHash(req)
  if (!(await take(req.scope, `sessions:${ip}`, Math.max(5, Math.ceil(o.limits.per_ip.hour / 3)), 3600))) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Too many chats from this address, try again later", "RATE_LIMITED")
  }
  const b = req.validatedBody
  const locale = o.assistant.locales.includes(b.locale.toLowerCase()) ? b.locale.toLowerCase() : o.assistant.locales[0]
  const prefix = o.storefront.path_prefixes.includes(b.path_prefix ?? "") ? (b.path_prefix ?? "") : ""
  const token = newToken()
  const s = req.scope.resolve<AiChatModuleService>(AI_CHAT_MODULE)
  const session = await s.createChatSessions({
    token_hash: hashToken(token),
    locale,
    country_code: b.country_code ? b.country_code.toLowerCase() : null,
    region_id: b.region_id && /^reg_[A-Za-z0-9]+$/.test(b.region_id) ? b.region_id : null,
    currency_code: b.currency_code ? b.currency_code.toLowerCase() : null,
    path_prefix: prefix,
    ip_hash: ip,
    page: cleanPage(b.page),
    consent_at: new Date(),
  })
  await addUsage(req.scope, dayKey(o.budget.timezone), { sessions: 1 }).catch(() => undefined)
  res.status(201).json({ session: { id: session.id, token, locale, turns_left: o.limits.max_turns } })
}
