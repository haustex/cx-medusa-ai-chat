import { sdk } from "./client"

export type Faq = { id: string; question: string; answer: string; locale: string | null }
export type Settings = { id: string; enabled: boolean; greeting: Record<string, string>; instructions: string; faqs: Faq[]; daily_budget_usd: number | null; updated_at: string | null }
export type Config = {
  provider: { id: string; model: string; ready: boolean; api_key_env: string }
  pricing: { input: number; output: number; cache_read: number; cache_write: number } | null
  budget: { default_daily_usd: number; timezone: string }
  limits: { max_message_chars: number; max_turns: number; per_ip: { hour: number; day: number } }
  retention_days: number
  locales: string[]
  whatsapp: string | null
  knowledge_topics: string[]
  show_credit: boolean
}
export type Stats = {
  days: number
  timezone: string
  today: { day: string; cost_usd: number; budget_usd: number; turns: number; sessions: number }
  totals: { cost_usd: number; turns: number; sessions: number; handoffs: number; refused: number; feedback_up: number; feedback_down: number; flagged: number }
  series: { day: string; cost_usd: number; turns: number; sessions: number; handoffs: number; refused: number }[]
}
export type SessionRow = {
  id: string
  locale: string
  country_code: string | null
  currency_code: string | null
  page: string | null
  turns: number
  cost_usd: number
  handoff_at: string | null
  handoff_reason: string | null
  handoff_source: string | null
  last_message_at: string | null
  created_at: string
  messages: number
  first_message: string | null
  feedback_up: number
  feedback_down: number
  flagged: boolean
}
export type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  tool_calls: { name: string; input: unknown; result: string; ms: number; error?: boolean }[] | null
  products: { handle: string; title: string; url: string; price: string | null }[] | null
  feedback: number | null
  flagged: string[] | null
  handoff: boolean
  input_tokens: number
  output_tokens: number
  cost_usd: number
  latency_ms: number | null
  metadata: { removed?: string[] } | null
  created_at: string
}
export type SessionDetail = Omit<SessionRow, "messages" | "first_message" | "feedback_up" | "feedback_down" | "flagged"> & { summary: string | null; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; messages: Message[] }

export const KEY = ["ai-chat"]
export const CONFIG_KEY = [...KEY, "config"]
export const SETTINGS_KEY = [...KEY, "settings"]
export const STATS_KEY = [...KEY, "stats"]
export const SESSIONS_KEY = [...KEY, "sessions"]

export const getConfig = () => sdk.client.fetch<Config>("/admin/ai-chat/config")
export const getSettings = () => sdk.client.fetch<{ settings: Settings }>("/admin/ai-chat/settings")
export const updateSettings = (body: Partial<Omit<Settings, "id" | "updated_at">>) => sdk.client.fetch<{ settings: Settings }>("/admin/ai-chat/settings", { method: "POST", body })
export const getStats = (days: number) => sdk.client.fetch<Stats>("/admin/ai-chat/stats", { query: { days } })
export type SessionFilters = { handoff?: "true" | "false"; feedback?: "up" | "down" | "any"; flagged?: "true"; q?: string; locale?: string }
export const listSessions = (filters: SessionFilters, limit: number, offset: number) =>
  sdk.client.fetch<{ sessions: SessionRow[]; count: number }>("/admin/ai-chat/sessions", { query: { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), limit, offset } })
export const getSession = (id: string) => sdk.client.fetch<{ session: SessionDetail }>(`/admin/ai-chat/sessions/${id}`)
export const deleteSession = (id: string) => sdk.client.fetch<{ deleted: boolean }>(`/admin/ai-chat/sessions/${id}`, { method: "DELETE" })

export const lang = (l: string) => (l.startsWith("id") ? "id" : "en")
export function formatDateTime(iso: string | null | undefined, l: string) {
  if (!iso) return "–"
  return new Intl.DateTimeFormat(l === "id" ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))
}
export const usd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`
