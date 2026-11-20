import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { AI_CHAT_MODULE } from "../../../../modules/ai-chat"
import type AiChatModuleService from "../../../../modules/ai-chat/service"
import type { AdminListSessionsType } from "../../../validators"

const PUBLIC = ["id", "locale", "country_code", "currency_code", "page", "turns", "cost_usd", "input_tokens", "output_tokens", "handoff_at", "handoff_reason", "handoff_source", "last_message_at", "created_at"] as const

/** Conversations, newest first. Filters: handoff, feedback, flagged, locale, q (text search in messages). */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const q = req.validatedQuery as AdminListSessionsType
  const s = req.scope.resolve<AiChatModuleService>(AI_CHAT_MODULE)
  const filters: Record<string, unknown> = {}
  if (q.handoff === "true") filters.handoff_at = { $ne: null }
  if (q.handoff === "false") filters.handoff_at = null
  if (q.lang) filters.locale = q.lang
  if (q.feedback || q.flagged || q.q) {
    const mf: Record<string, unknown> = {}
    if (q.feedback === "up") mf.feedback = 1
    else if (q.feedback === "down") mf.feedback = -1
    else if (q.feedback === "any") mf.feedback = { $ne: null }
    if (q.flagged) mf.flagged = { $ne: null }
    if (q.q) mf.content = { $ilike: `%${q.q.replace(/[%_]/g, "")}%` }
    const matching = await s.listChatMessages(mf, { select: ["session_id"], take: 2000 })
    const ids = [...new Set(matching.map((m) => (m as unknown as { session_id: string }).session_id))]
    if (!ids.length) {
      res.json({ sessions: [], count: 0, limit: q.limit, offset: q.offset })
      return
    }
    filters.id = { $in: ids }
  }
  const [rows, count] = await s.listAndCountChatSessions(filters, { order: { created_at: "DESC" }, take: q.limit, skip: q.offset })
  const ids = rows.map((r) => r.id)
  const messages = ids.length ? await s.listChatMessages({ session_id: { $in: ids } }, { select: ["id", "session_id", "role", "content", "feedback", "flagged", "created_at"], order: { created_at: "ASC" }, take: 5000 }) : []
  const bySession = new Map<string, typeof messages>()
  for (const m of messages) {
    const sid = (m as unknown as { session_id: string }).session_id
    bySession.set(sid, [...(bySession.get(sid) ?? []), m])
  }
  res.json({
    sessions: rows.map((r) => {
      const ms = bySession.get(r.id) ?? []
      const first = ms.find((m) => m.role === "user")
      return {
        ...Object.fromEntries(PUBLIC.map((k) => [k, (r as Record<string, unknown>)[k]])),
        cost_usd: Number(r.cost_usd),
        messages: ms.length,
        first_message: first ? first.content.slice(0, 140) : null,
        feedback_up: ms.filter((m) => m.feedback === 1).length,
        feedback_down: ms.filter((m) => m.feedback === -1).length,
        flagged: ms.some((m) => m.flagged),
      }
    }),
    count,
    limit: q.limit,
    offset: q.offset,
  })
}
