import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { AI_CHAT_MODULE } from "../../../../../modules/ai-chat"
import type AiChatModuleService from "../../../../../modules/ai-chat/service"

/** One conversation with its messages (tool calls, cards, feedback, guard notes). The token hash and IP hash stay out. */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const s = req.scope.resolve<AiChatModuleService>(AI_CHAT_MODULE)
  const [session] = await s.listChatSessions({ id: req.params.id }, { take: 1 })
  if (!session) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Chat session not found")
  const messages = await s.listChatMessages({ session_id: session.id }, { order: { created_at: "ASC" }, take: 500 })
  const { token_hash: _t, ip_hash: _i, ...rest } = session as unknown as Record<string, unknown>
  void _t
  void _i
  res.json({ session: { ...rest, cost_usd: Number(session.cost_usd), messages: messages.map((m) => ({ ...m, cost_usd: Number(m.cost_usd) })) } })
}

export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const s = req.scope.resolve<AiChatModuleService>(AI_CHAT_MODULE)
  const [session] = await s.listChatSessions({ id: req.params.id }, { take: 1 })
  if (!session) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Chat session not found")
  const messages = await s.listChatMessages({ session_id: session.id }, { select: ["id"], take: 1000 })
  if (messages.length) await s.deleteChatMessages(messages.map((m) => m.id))
  await s.deleteChatSessions([session.id])
  res.json({ id: session.id, object: "ai_chat_session", deleted: true })
}
