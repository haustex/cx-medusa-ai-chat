import { model } from "@medusajs/framework/utils"
import ChatMessage from "./chat-message"

/**
 * One visitor conversation. The visitor holds a random token (only its SHA-256 is stored) that every later call
 * must present; nothing else identifies the person. `ip_hash` (salted, truncated) exists for rate limiting only.
 */
const ChatSession = model
  .define("ai_chat_session", {
    id: model.id({ prefix: "acs" }).primaryKey(),
    token_hash: model.text().unique(),
    locale: model.text(),
    country_code: model.text().nullable(),
    region_id: model.text().nullable(),
    currency_code: model.text().nullable(),
    /** Market prefix of the storefront URLs ("" or "/us"): product links sent to the visitor */
    path_prefix: model.text().default(""),
    ip_hash: model.text().nullable(),
    /** Path of the page the chat was opened on (no query string) */
    page: model.text().nullable(),
    consent_at: model.dateTime().nullable(),
    turns: model.number().default(0),
    input_tokens: model.number().default(0),
    output_tokens: model.number().default(0),
    cache_read_tokens: model.number().default(0),
    cache_write_tokens: model.number().default(0),
    cost_usd: model.float().default(0),
    /** Prompt size (input + cache tokens) of the last model call: decides when older turns get summarised */
    last_prompt_tokens: model.number().default(0),
    /** Running summary of the turns that were dropped from the prompt */
    summary: model.text().nullable(),
    /** id of the last message the summary covers */
    summarized_until: model.text().nullable(),
    handoff_at: model.dateTime().nullable(),
    handoff_reason: model.text().nullable(),
    /** "ai" (the assistant offered it) or "button" (the visitor pressed the CS button) */
    handoff_source: model.text().nullable(),
    last_message_at: model.dateTime().nullable(),
    metadata: model.json().nullable(),
    messages: model.hasMany(() => ChatMessage, { mappedBy: "session" }),
  })
  .indexes([{ on: ["handoff_at"] }, { on: ["last_message_at"] }])

export default ChatSession
