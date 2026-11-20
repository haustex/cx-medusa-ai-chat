import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { ChatRefused, runTurn } from "../../../../../../lib/chat"
import { clientIpHash, publishableKey, Sse } from "../../../../../../lib/http"
import { getOptions } from "../../../../../../lib/options"
import { take } from "../../../../../../lib/rate-limit"
import { authorizeSession, cleanPage } from "../../../../../../lib/sessions"
import type { StoreSendMessageType } from "../../../../../validators"

/**
 * One customer message → the assistant's answer as server-sent events:
 * `start {message_id}`, `delta {text}`, `products {items}`, `handoff {url, reason}`, `notice {code}`,
 * `done {message_id, turns_left, handoff}`, or `error {code}` before any text when the turn is refused.
 */
export const POST = async (req: MedusaRequest<StoreSendMessageType>, res: MedusaResponse) => {
  const o = getOptions(req.scope)
  const session = await authorizeSession(req.scope, req.params.id, req.validatedBody.token)
  const ip = clientIpHash(req)
  const okIp = (await take(req.scope, `msg:h:${ip}`, o.limits.per_ip.hour, 3600)) && (await take(req.scope, `msg:d:${ip}`, o.limits.per_ip.day, 86400))
  const okSession = okIp && (await take(req.scope, `msg:s:${session.id}`, o.limits.per_session_minute, 60))
  if (!okIp || !okSession) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Too many messages, slow down", "RATE_LIMITED")
  if (req.validatedBody.message.length > o.limits.max_message_chars) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Message longer than ${o.limits.max_message_chars} characters`, "MESSAGE_TOO_LONG")
  }

  const sse = new Sse(res)
  const abort = new AbortController()
  res.on("close", () => abort.abort())
  try {
    await runTurn({
      container: req.scope,
      sessionId: session.id,
      text: req.validatedBody.message,
      page: cleanPage(req.validatedBody.page) ?? session.page ?? null,
      publishableKey: publishableKey(req),
      signal: abort.signal,
      emit: (e) => sse.send(e.type, e),
    })
  } catch (e) {
    if (e instanceof ChatRefused) sse.send("error", { type: "error", code: e.code })
    else {
      sse.send("error", { type: "error", code: "failed" })
      throw e
    }
  } finally {
    sse.end()
  }
}
