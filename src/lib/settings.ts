import type { MedusaContainer } from "@medusajs/framework/types"
import { AI_CHAT_MODULE } from "../modules/ai-chat"
import type AiChatModuleService from "../modules/ai-chat/service"
import type { LocaleText } from "./options"

export type Faq = { id: string; question: string; answer: string; locale: string | null }

export type Settings = {
  id: string
  enabled: boolean
  greeting: LocaleText
  instructions: string
  faqs: Faq[]
  daily_budget_usd: number | null
  updated_at: Date | null
}

const service = (container: MedusaContainer) => container.resolve<AiChatModuleService>(AI_CHAT_MODULE)

let cached: { at: number; value: Settings } | null = null
const TTL = 15_000

const normalise = (row: Record<string, unknown>): Settings => ({
  id: String(row.id),
  enabled: row.enabled !== false,
  greeting: (row.greeting && typeof row.greeting === "object" ? (row.greeting as LocaleText) : {}) ?? {},
  instructions: typeof row.instructions === "string" ? row.instructions : "",
  faqs: Array.isArray(row.faqs)
    ? (row.faqs as Partial<Faq>[]).filter((f) => f && typeof f.question === "string" && typeof f.answer === "string").map((f, i) => ({ id: String(f.id ?? i), question: f.question!, answer: f.answer!, locale: typeof f.locale === "string" && f.locale ? f.locale : null }))
    : [],
  daily_budget_usd: typeof row.daily_budget_usd === "number" ? row.daily_budget_usd : null,
  updated_at: (row.updated_at as Date | null) ?? null,
})

/** The single settings row (created on first use), cached briefly per process. */
export async function getSettings(container: MedusaContainer, fresh = false): Promise<Settings> {
  if (!fresh && cached && Date.now() - cached.at < TTL) return cached.value
  const s = service(container)
  const [row] = await s.listChatSettings({}, { take: 1, order: { created_at: "ASC" } })
  const value = normalise((row as Record<string, unknown>) ?? (await s.createChatSettings({ enabled: true })))
  cached = { at: Date.now(), value }
  return value
}

export async function updateSettings(container: MedusaContainer, patch: Partial<Omit<Settings, "id" | "updated_at">>): Promise<Settings> {
  const current = await getSettings(container, true)
  const { faqs, ...rest } = patch
  const row = await service(container).updateChatSettings({ id: current.id, ...rest, ...(faqs ? { faqs: faqs as unknown as Record<string, unknown> } : {}) })
  cached = null
  return normalise(row as unknown as Record<string, unknown>)
}

export const invalidateSettings = () => {
  cached = null
}
