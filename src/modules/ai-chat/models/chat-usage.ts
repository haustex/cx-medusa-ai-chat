import { model } from "@medusajs/framework/utils"

/** Spend and counts per calendar day (in the budget timezone): the daily budget and the Admin statistics. */
const ChatUsage = model.define("ai_chat_usage", {
  id: model.id({ prefix: "acu" }).primaryKey(),
  day: model.text().unique(),
  cost_usd: model.float().default(0),
  turns: model.number().default(0),
  sessions: model.number().default(0),
  handoffs: model.number().default(0),
  input_tokens: model.number().default(0),
  output_tokens: model.number().default(0),
  cache_read_tokens: model.number().default(0),
  cache_write_tokens: model.number().default(0),
  /** Turns refused because the budget was spent */
  refused: model.number().default(0),
})

export default ChatUsage
