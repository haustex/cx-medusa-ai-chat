import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { randomBytes } from "node:crypto"
import { getSettings, updateSettings } from "../../../../lib/settings"
import type { AdminUpdateSettingsType } from "../../../validators"

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ settings: await getSettings(req.scope, true) })
}

export const POST = async (req: AuthenticatedMedusaRequest<AdminUpdateSettingsType>, res: MedusaResponse) => {
  const b = req.validatedBody
  const patch: Parameters<typeof updateSettings>[1] = {}
  if (typeof b.enabled === "boolean") patch.enabled = b.enabled
  if (b.greeting) patch.greeting = Object.fromEntries(Object.entries(b.greeting).map(([k, v]) => [k.toLowerCase(), v.trim()]).filter(([, v]) => v))
  if (typeof b.instructions === "string") patch.instructions = b.instructions.trim()
  if (b.faqs) patch.faqs = b.faqs.map((f) => ({ id: f.id || randomBytes(6).toString("hex"), question: f.question.trim(), answer: f.answer.trim(), locale: f.locale ? f.locale.toLowerCase() : null }))
  if (b.daily_budget_usd !== undefined) patch.daily_budget_usd = b.daily_budget_usd
  res.json({ settings: await updateSettings(req.scope, patch) })
}
