import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { ResolvedOptions } from "./options"

type FeedInput = { key: string; title: string; description: string; session_id: string }

/** One line in the Admin bell (Local Notification Provider on the configured channel). Never throws. */
export async function pushFeed(container: MedusaContainer, options: ResolvedOptions, input: FeedInput): Promise<boolean> {
  if (!options.feed.enabled) return false
  try {
    if (typeof container.hasRegistration === "function" && !container.hasRegistration(Modules.NOTIFICATION)) return false
    const notifications = container.resolve(Modules.NOTIFICATION)
    const link = options.feed.admin_url ? `${options.feed.admin_url}/ai-chat?session=${encodeURIComponent(input.session_id)}` : null
    const description = [input.description.trim(), link ? `Admin: ${link.replace(/^https?:\/\/[^/]+/, "")}` : null].filter(Boolean).join("\n")
    await notifications.createNotifications({
      to: "",
      channel: options.feed.channel,
      template: options.feed.template,
      data: { title: input.title, description, ...(link ? { link } : {}) },
      trigger_type: "ai-chat.handoff",
      resource_id: input.session_id,
      resource_type: "ai_chat_session",
      idempotency_key: `ai-chat:${input.key}`,
    })
    return true
  } catch (e) {
    try {
      container.resolve(ContainerRegistrationKeys.LOGGER).warn(`[ai-chat] feed ${input.key}: ${(e as Error).message}`)
    } catch {}
    return false
  }
}
