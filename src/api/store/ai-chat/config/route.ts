import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { overBudget } from "../../../../lib/chat"
import { noStore } from "../../../../lib/http"
import { getOptions, pick } from "../../../../lib/options"
import { providerReady } from "../../../../lib/providers"
import { getSettings } from "../../../../lib/settings"

/**
 * What the storefront needs before the first message: whether the assistant is on, its name, greeting, CS hours
 * and the consent notice (`?lang=`). No secrets, cacheable for a minute by the storefront.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  noStore(res)
  const o = getOptions(req.scope)
  const settings = await getSettings(req.scope)
  // `lang`, not `locale`: Medusa strips a `locale` query parameter from store requests (Translation Module)
  const requested = (req.validatedQuery?.lang ?? req.query?.lang) as unknown
  const locale = typeof requested === "string" && o.assistant.locales.includes(requested) ? requested : o.assistant.locales[0]
  const fallback = o.assistant.locales[0]
  const enabled = settings.enabled && providerReady(req.scope)
  const over = enabled ? await overBudget(req.scope, o, settings) : false
  res.json({
    enabled,
    over_budget: over,
    locale,
    name: pick(o.assistant.name, locale, fallback) || "AI Assistant",
    greeting: pick(settings.greeting, locale, fallback) || pick(o.assistant.greeting, locale, fallback) || null,
    whatsapp: o.contact.whatsapp,
    hours: pick(o.contact.hours, locale, fallback) || null,
    privacy_path: o.storefront.privacy_path,
    limits: { max_message_chars: o.limits.max_message_chars, max_turns: o.limits.max_turns },
    provider: o.provider.id === "mock" ? "mock" : o.provider.id,
  })
}
