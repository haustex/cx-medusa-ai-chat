import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { purgeOldSessions } from "medusa-ai-chat/jobs/ai-chat-retention"

/** Runs the plugin's scheduled job on demand (cron is not waited for in tests). */
export const POST = async (req: MedusaRequest<{ job: string; now?: string }>, res: MedusaResponse) => {
  if (req.body?.job !== "retention") {
    res.status(400).json({ message: "job must be retention" })
    return
  }
  const removed = await purgeOldSessions(req.scope, req.body?.now ? new Date(req.body.now) : new Date())
  res.json({ ok: true, removed })
}
