import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getOptions } from "../../../../lib/options"
import { providerReady } from "../../../../lib/providers"

/** Non-secret plugin options the Admin page shows (provider, model, prices, limits). */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const o = getOptions(req.scope)
  res.json({
    provider: { id: o.provider.id, model: o.provider.model, ready: providerReady(req.scope), api_key_env: o.provider.api_key_env },
    pricing: o.pricing,
    budget: { default_daily_usd: o.budget.daily_usd, timezone: o.budget.timezone },
    limits: o.limits,
    retention_days: o.retention_days,
    locales: o.assistant.locales,
    whatsapp: o.contact.whatsapp,
    knowledge_topics: Object.keys(o.knowledge.pages),
    show_credit: o.showCredit,
  })
}
