import type { MedusaContainer } from "@medusajs/framework/types"
import { AI_CHAT_MODULE } from "../modules/ai-chat"
import type AiChatModuleService from "../modules/ai-chat/service"
import type { Pricing } from "./options"
import type { Usage } from "./providers/types"

/** Calendar day in a time zone as YYYY-MM-DD */
export function dayKey(timezone: string, at = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at)
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

/** USD for a usage at a price list (per million tokens); 0 without prices */
export function costOf(usage: Usage, pricing: Pricing | null): number {
  if (!pricing) return 0
  const c = (usage.input_tokens * pricing.input + usage.output_tokens * pricing.output + usage.cache_read_tokens * pricing.cache_read + usage.cache_write_tokens * pricing.cache_write) / 1_000_000
  return Math.round(c * 1e9) / 1e9
}

export type UsageDelta = Partial<{ cost_usd: number; turns: number; sessions: number; handoffs: number; refused: number } & Usage>

const service = (container: MedusaContainer) => container.resolve<AiChatModuleService>(AI_CHAT_MODULE)

export async function usageOfDay(container: MedusaContainer, day: string) {
  const [row] = await service(container).listChatUsages({ day }, { take: 1 })
  return row ?? null
}

/** Adds to today's row (created when missing). Read-modify-write: two simultaneous turns may under-count slightly. */
export async function addUsage(container: MedusaContainer, day: string, delta: UsageDelta) {
  const s = service(container)
  const row = await usageOfDay(container, day)
  const keys = ["cost_usd", "turns", "sessions", "handoffs", "refused", "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens"] as const
  if (!row) {
    await s.createChatUsages({ day, ...Object.fromEntries(keys.map((k) => [k, delta[k] ?? 0])) })
    return
  }
  const patch: Record<string, number> = {}
  for (const k of keys) if (delta[k]) patch[k] = Number((row as Record<string, unknown>)[k] ?? 0) + (delta[k] ?? 0)
  if (Object.keys(patch).length) await s.updateChatUsages({ id: row.id, ...patch })
}
