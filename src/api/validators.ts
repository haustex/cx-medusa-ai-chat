import { z } from "@medusajs/framework/zod"

export const StoreCreateSession = z.object({
  locale: z.string().min(2).max(10),
  country_code: z.string().min(2).max(2).optional().nullable(),
  region_id: z.string().max(64).optional().nullable(),
  currency_code: z.string().min(3).max(3).optional().nullable(),
  path_prefix: z.string().max(12).optional().default(""),
  page: z.string().max(300).optional().nullable(),
  consent: z.literal(true),
})
export type StoreCreateSessionType = z.infer<typeof StoreCreateSession>

export const StoreSendMessage = z.object({
  token: z.string().min(32).max(64),
  message: z.string().min(1).max(10000),
  page: z.string().max(300).optional().nullable(),
})
export type StoreSendMessageType = z.infer<typeof StoreSendMessage>

export const StoreHandoff = z.object({
  token: z.string().min(32).max(64),
  page: z.string().max(300).optional().nullable(),
})
export type StoreHandoffType = z.infer<typeof StoreHandoff>

export const StoreFeedback = z.object({
  token: z.string().min(32).max(64),
  session_id: z.string().max(64),
  value: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
})
export type StoreFeedbackType = z.infer<typeof StoreFeedback>

export const StoreConfigQuery = z.object({ lang: z.string().max(10).optional() })

const faq = z.object({ id: z.string().max(64).optional(), question: z.string().min(1).max(500), answer: z.string().min(1).max(4000), locale: z.string().max(10).nullable().optional() })

export const AdminUpdateSettings = z.object({
  enabled: z.boolean().optional(),
  greeting: z.record(z.string(), z.string().max(1000)).optional(),
  instructions: z.string().max(8000).optional(),
  faqs: z.array(faq).max(200).optional(),
  daily_budget_usd: z.number().min(0).max(100000).nullable().optional(),
})
export type AdminUpdateSettingsType = z.infer<typeof AdminUpdateSettings>

export const AdminListSessions = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(25),
  offset: z.coerce.number().min(0).optional().default(0),
  handoff: z.enum(["true", "false"]).optional(),
  feedback: z.enum(["up", "down", "any"]).optional(),
  flagged: z.enum(["true"]).optional(),
  lang: z.string().max(10).optional(),
  q: z.string().max(200).optional(),
})
export type AdminListSessionsType = z.infer<typeof AdminListSessions>

export const AdminStatsQuery = z.object({ days: z.coerce.number().min(1).max(366).optional().default(30) })
