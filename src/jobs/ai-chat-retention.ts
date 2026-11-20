import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { AI_CHAT_MODULE } from "../modules/ai-chat"
import type AiChatModuleService from "../modules/ai-chat/service"
import { getOptions } from "../lib/options"

/** Deletes conversations older than `retention_days` (messages and sessions, hard delete). */
export async function purgeOldSessions(container: MedusaContainer, now = new Date()): Promise<number> {
  const options = getOptions(container)
  const s = container.resolve<AiChatModuleService>(AI_CHAT_MODULE)
  const cutoff = new Date(now.getTime() - options.retention_days * 86400_000)
  let removed = 0
  for (;;) {
    const old = await s.listChatSessions({ created_at: { $lt: cutoff } }, { select: ["id"], take: 200 })
    if (!old.length) break
    const ids = old.map((o) => o.id)
    const messages = await s.listChatMessages({ session_id: { $in: ids } }, { select: ["id"], take: 20000 })
    if (messages.length) await s.deleteChatMessages(messages.map((m) => m.id))
    await s.deleteChatSessions(ids)
    removed += ids.length
    if (old.length < 200) break
  }
  return removed
}

export default async function aiChatRetentionJob(container: MedusaContainer) {
  const removed = await purgeOldSessions(container)
  if (removed) container.resolve(ContainerRegistrationKeys.LOGGER).info(`[ai-chat] removed ${removed} conversation(s) past retention`)
}

export const config = {
  name: "ai-chat-retention",
  schedule: "41 3 * * *",
}
