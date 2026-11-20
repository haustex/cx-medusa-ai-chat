import { MedusaService } from "@medusajs/framework/utils"
import { ChatMessage, ChatSession, ChatSetting, ChatUsage } from "./models"

class AiChatModuleService extends MedusaService({
  ChatSession,
  ChatMessage,
  ChatSetting,
  ChatUsage,
}) {}

export default AiChatModuleService
