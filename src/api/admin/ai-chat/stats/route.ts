import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { AI_CHAT_MODULE } from "../../../../modules/ai-chat"
import type AiChatModuleService from "../../../../modules/ai-chat/service"
import { dailyBudget } from "../../../../lib/chat"
import { getOptions } from "../../../../lib/options"
import { getSettings } from "../../../../lib/settings"
import { dayKey } from "../../../../lib/usage"

/** Per-day usage for the last `days` days plus today's spend against the budget and feedback totals. */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const o = getOptions(req.scope)
  const settings = await getSettings(req.scope)
  const days = Number(req.validatedQuery?.days ?? 30)
  const s = req.scope.resolve<AiChatModuleService>(AI_CHAT_MODULE)
  const since = dayKey(o.budget.timezone, new Date(Date.now() - (days - 1) * 86400_000))
  const rows = await s.listChatUsages({ day: { $gte: since } }, { order: { day: "ASC" }, take: days + 1 })
  const today = dayKey(o.budget.timezone)
  const totals = rows.reduce(
    (acc, r) => ({ cost_usd: acc.cost_usd + Number(r.cost_usd), turns: acc.turns + r.turns, sessions: acc.sessions + r.sessions, handoffs: acc.handoffs + r.handoffs, refused: acc.refused + r.refused }),
    { cost_usd: 0, turns: 0, sessions: 0, handoffs: 0, refused: 0 }
  )
  const sinceDate = new Date(Date.now() - days * 86400_000)
  const [, up] = await s.listAndCountChatMessages({ feedback: 1, created_at: { $gte: sinceDate } }, { take: 0 })
  const [, down] = await s.listAndCountChatMessages({ feedback: -1, created_at: { $gte: sinceDate } }, { take: 0 })
  const [, flagged] = await s.listAndCountChatMessages({ flagged: { $ne: null }, role: "assistant", created_at: { $gte: sinceDate } }, { take: 0 })
  const todayRow = rows.find((r) => r.day === today)
  res.json({
    days,
    timezone: o.budget.timezone,
    today: { day: today, cost_usd: Number(todayRow?.cost_usd ?? 0), budget_usd: dailyBudget(o, settings), turns: todayRow?.turns ?? 0, sessions: todayRow?.sessions ?? 0 },
    totals: { ...totals, feedback_up: up, feedback_down: down, flagged },
    series: rows.map((r) => ({ day: r.day, cost_usd: Number(r.cost_usd), turns: r.turns, sessions: r.sessions, handoffs: r.handoffs, refused: r.refused })),
  })
}
