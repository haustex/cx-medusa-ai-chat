import { model } from "@medusajs/framework/utils"

/** Merchant settings edited in the Admin (one row). Plugin options are the defaults these override. */
const ChatSetting = model.define("ai_chat_setting", {
  id: model.id({ prefix: "acst" }).primaryKey(),
  enabled: model.boolean().default(true),
  /** Greeting per locale: { en: "...", id: "..." } */
  greeting: model.json().nullable(),
  /** Extra instructions appended to the system prompt */
  instructions: model.text().nullable(),
  /** [{ id, question, answer, locale }] */
  faqs: model.json().nullable(),
  /** null → the plugin option */
  daily_budget_usd: model.float().nullable(),
  metadata: model.json().nullable(),
})

export default ChatSetting
