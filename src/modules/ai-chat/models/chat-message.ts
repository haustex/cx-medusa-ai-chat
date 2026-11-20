import { model } from "@medusajs/framework/utils"
import ChatSession from "./chat-session"

const ChatMessage = model
  .define("ai_chat_message", {
    id: model.id({ prefix: "acm" }).primaryKey(),
    session: model.belongsTo(() => ChatSession, { mappedBy: "messages" }),
    role: model.enum(["user", "assistant"]),
    /** The text as shown to the visitor (after the guards) */
    content: model.text(),
    /** Tools the assistant called for this answer: [{ name, input, result }] (results compacted) */
    tool_calls: model.json().nullable(),
    /** Product cards shown under the answer */
    products: model.json().nullable(),
    /** Visitor's thumbs: 1 or -1 */
    feedback: model.number().nullable(),
    /** Guard notes, e.g. ["amount"] when a sentence with an unverified amount was removed */
    flagged: model.json().nullable(),
    handoff: model.boolean().default(false),
    input_tokens: model.number().default(0),
    output_tokens: model.number().default(0),
    cost_usd: model.float().default(0),
    latency_ms: model.number().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([{ on: ["session_id"] }])

export default ChatMessage
