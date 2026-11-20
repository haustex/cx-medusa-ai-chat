import type { ResolvedOptions } from "./options"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { AI_CHAT_MODULE } from "../modules/ai-chat"
import type AiChatModuleService from "../modules/ai-chat/service"
import { hashToken, isValidTokenShape } from "./tokens"

/** The session named by id whose token matches; 404 otherwise (same answer for unknown id and wrong token). */
export async function authorizeSession(container: MedusaContainer, id: string, token: unknown) {
  if (!isValidTokenShape(token) || typeof id !== "string" || !id.startsWith("acs_")) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Chat session not found")
  }
  const s = container.resolve<AiChatModuleService>(AI_CHAT_MODULE)
  const [session] = await s.listChatSessions({ id, token_hash: hashToken(token) }, { take: 1 })
  if (!session) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Chat session not found")
  return session
}

/** A storefront path without query string or host, or null */
export const cleanPage = (page: unknown): string | null => {
  if (typeof page !== "string") return null
  const p = page.trim().split(/[?#]/)[0]
  return /^\/[A-Za-z0-9\-._~/%]{0,280}$/.test(p) ? p : null
}

type RegionLite = { id: string; currency_code: string; countries?: { iso_2: string }[] }
let regionsCache: { at: number; regions: RegionLite[] } | null = null

/**
 * The region a storefront session belongs to when it only sent a country or currency (the Store API needs a
 * region_id to price products): looked up on this server's own /store/regions, cached five minutes.
 */
export async function resolveRegion(o: ResolvedOptions, publishableKey: string | null, countryCode: string | null, currencyCode: string | null): Promise<RegionLite | null> {
  if (!regionsCache || Date.now() - regionsCache.at > 300_000) {
    try {
      const res = await fetch(`${o.backend_url}/store/regions?limit=100&fields=id,currency_code,*countries`, {
        headers: { accept: "application/json", ...(publishableKey ? { "x-publishable-api-key": publishableKey } : {}) },
        signal: AbortSignal.timeout(o.tool_timeout_ms),
      })
      if (!res.ok) return null
      regionsCache = { at: Date.now(), regions: ((await res.json()) as { regions: RegionLite[] }).regions ?? [] }
    } catch {
      return null
    }
  }
  const regions = regionsCache.regions
  return (countryCode && regions.find((r) => r.countries?.some((c) => c.iso_2?.toLowerCase() === countryCode))) || (currencyCode && regions.find((r) => r.currency_code?.toLowerCase() === currencyCode)) || regions[0] || null
}
