import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { AI_CHAT_MODULE } from "../../../../../../modules/ai-chat"
import type AiChatModuleService from "../../../../../../modules/ai-chat/service"
import { noStore } from "../../../../../../lib/http"
import { authorizeSession } from "../../../../../../lib/sessions"
import type { StoreFeedbackType } from "../../../../../validators"

/** Thumbs up (1) / down (-1) / cleared (0) on one assistant answer of the visitor's own session. */
export const POST = async (req: MedusaRequest<StoreFeedbackType>, res: MedusaResponse) => {
  noStore(res)
  const session = await authorizeSession(req.scope, req.validatedBody.session_id, req.validatedBody.token)
  const s = req.scope.resolve<AiChatModuleService>(AI_CHAT_MODULE)
  const [message] = await s.listChatMessages({ id: req.params.id, session_id: session.id, role: "assistant" }, { take: 1 })
  if (!message) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Message not found")
  await s.updateChatMessages({ id: message.id, feedback: req.validatedBody.value === 0 ? null : req.validatedBody.value })
  res.json({ ok: true })
}
