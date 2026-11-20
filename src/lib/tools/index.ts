import { getProduct, searchProducts } from "./catalog"
import type { ToolContext } from "./context"
import { handoffToCs } from "./handoff"
import { getPolicy } from "./policies"
import { shippingEstimate } from "./shipping"

export { ToolContext } from "./context"
export type { Handoff, ProductCard, SessionFacts, ToolCallRecord } from "./context"
export { toolDefinitions, HANDOFF_REASONS } from "./definitions"

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "")

/** Runs one tool call; the result is a JSON string for the model. Errors become a result the model can explain. */
export async function runTool(ctx: ToolContext, name: string, rawInput: unknown): Promise<string> {
  const started = Date.now()
  const input = (rawInput && typeof rawInput === "object" ? rawInput : {}) as Record<string, unknown>
  let result: unknown
  let error = false
  try {
    if ("__invalid_json" in input) throw new Error("tool input was not valid JSON; call the tool again")
    switch (name) {
      case "search_products":
        result = await searchProducts(ctx, str(input.query))
        break
      case "get_product":
        result = await getProduct(ctx, str(input.handle))
        break
      case "shipping_estimate":
        result = await shippingEstimate(ctx, str(input.destination, 80), typeof input.weight_kg === "number" && input.weight_kg > 0 && input.weight_kg < 1000 ? input.weight_kg : null)
        break
      case "get_policy":
        result = await getPolicy(ctx, str(input.topic, 40))
        break
      case "handoff_to_cs": {
        const h = await handoffToCs(ctx, { reason: str(input.reason, 40), summary: str(input.summary, 600) || null, source: "ai" })
        result = { ok: true, whatsapp_url: h.url, note: "Tell the customer the WhatsApp button is ready and that a person will continue from there." }
        break
      }
      default:
        throw new Error(`unknown tool ${name}`)
    }
  } catch (e) {
    error = true
    result = { error: (e as Error).message.slice(0, 300), note: "The data could not be fetched. Tell the customer you cannot check this right now and offer the CS button. Do not guess." }
    ctx.logger.warn(`[ai-chat] tool ${name} failed: ${(e as Error).message}`)
  }
  const text = JSON.stringify(result)
  if (!error) ctx.allowNumbersFrom(text)
  ctx.calls.push({ name, input, result: text.length > 4000 ? text.slice(0, 4000) + "…" : text, ms: Date.now() - started, ...(error ? { error: true } : {}) })
  return text
}
