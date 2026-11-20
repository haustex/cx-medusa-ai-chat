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
