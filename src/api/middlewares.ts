import { defineMiddlewares, validateAndTransformBody, validateAndTransformQuery } from "@medusajs/framework/http"
import { AdminListSessions, AdminStatsQuery, AdminUpdateSettings, StoreConfigQuery, StoreCreateSession, StoreFeedback, StoreHandoff, StoreSendMessage } from "./validators"

export default defineMiddlewares({
  routes: [
    { matcher: "/store/ai-chat/config", method: "GET", middlewares: [validateAndTransformQuery(StoreConfigQuery, {})] },
    { matcher: "/store/ai-chat/sessions", method: "POST", middlewares: [validateAndTransformBody(StoreCreateSession)] },
    { matcher: "/store/ai-chat/sessions/:id/messages", method: "POST", middlewares: [validateAndTransformBody(StoreSendMessage)] },
    { matcher: "/store/ai-chat/sessions/:id/handoff", method: "POST", middlewares: [validateAndTransformBody(StoreHandoff)] },
    { matcher: "/store/ai-chat/messages/:id/feedback", method: "POST", middlewares: [validateAndTransformBody(StoreFeedback)] },
    { matcher: "/admin/ai-chat/settings", method: "POST", middlewares: [validateAndTransformBody(AdminUpdateSettings)] },
    { matcher: "/admin/ai-chat/sessions", method: "GET", middlewares: [validateAndTransformQuery(AdminListSessions, {})] },
    { matcher: "/admin/ai-chat/stats", method: "GET", middlewares: [validateAndTransformQuery(AdminStatsQuery, {})] },
  ],
})
