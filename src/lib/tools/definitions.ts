import { languageName } from "../prompt"
import type { ToolDef } from "../providers/types"
import type { ToolContext } from "./context"
import { policyTopics } from "./policies"

export const HANDOFF_REASONS = ["complaint", "refund", "price_negotiation", "custom_order", "cannot_answer", "customer_request", "order_status", "other"] as const
export type HandoffReason = (typeof HANDOFF_REASONS)[number]

const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false })

/** The tool list for a session (deterministic order: part of the cached prompt prefix). */
export function toolDefinitions(ctx: ToolContext): ToolDef[] {
  const topics = policyTopics(ctx)
  const tools: ToolDef[] = [
    {
      name: "search_products",
      description: "Search the store catalog. Returns matching products with the price in the customer's currency, availability and a link. Call it for any question about what is sold, prices, sizes or stock. Never state a price you did not get from this tool or get_product.",
      input_schema: obj({ query: { type: "string", description: `Search words (product type, material, use, size). The catalog is written in ${languageName(ctx.options.catalog.language)}: retry with words in that language when another language finds nothing` } }),
    },
    {
      name: "get_product",
      description: "Full details of one product by handle (variants with price and stock, dimensions, material, care). Use after search_products when the customer asks about a specific product.",
      input_schema: obj({ handle: { type: "string", description: "The product handle from search results" } }),
    },
  ]
  if (ctx.options.shipping.enabled) {
    tools.push({
      name: "shipping_estimate",
      description: "Shipping services, per-kg rates and delivery estimates for a destination, from the store's real rate card. Destination: province name for the store's own country, otherwise country name or ISO code. Say the result is approximate and the exact cost shows at checkout.",
      input_schema: obj({
        destination: { type: "string", description: "Province (e.g. Jawa Barat) or country (e.g. United States, US)" },
        weight_kg: { type: ["number", "null"], description: "Parcel weight in kg if known, else null" },
      }),
    })
  }
  if (topics.length) {
    tools.push({
      name: "get_policy",
      description: `The store's own page about a topic (${topics.join(", ")}). Answer policy questions only from this text; quote conditions as written.`,
      input_schema: obj({ topic: { type: "string", enum: topics } }),
    })
  }
  if (ctx.options.contact.whatsapp) {
    tools.push({
      name: "handoff_to_cs",
      description: "Prepare a WhatsApp handover to the human customer service team. Call it when the customer wants to complain, asks for a refund or exchange, negotiates a price, wants a custom or made-to-order item, asks about an existing order, or asks something you cannot answer from the tools. After calling it, tell the customer to tap the WhatsApp button.",
      input_schema: obj({
        reason: { type: "string", enum: [...HANDOFF_REASONS] },
        summary: { type: "string", description: "One or two neutral sentences for the CS agent: what the customer wants, in the customer's language. No prices unless they came from a tool." },
      }),
    })
  }
  return tools
}
