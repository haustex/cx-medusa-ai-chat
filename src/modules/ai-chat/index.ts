import { Module } from "@medusajs/framework/utils"
import AiChatModuleService from "./service"

export const AI_CHAT_MODULE = "ai_chat"

export default Module(AI_CHAT_MODULE, {
  service: AiChatModuleService,
})
