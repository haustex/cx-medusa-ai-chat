import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { AI_CHAT_MODULE } from "../modules/ai-chat"
import type AiChatModuleService from "../modules/ai-chat/service"
import { getOptions, pick, type ResolvedOptions } from "./options"
import { buildSystem, SUMMARY_SYSTEM } from "./prompt"
import { getProvider } from "./providers"
import { addUsage as sumUsage, emptyUsage, type ChatTurn, type ContentPart, type Usage } from "./providers/types"
import { getSettings, type Settings } from "./settings"
import { asData, estimateTokens, extractAmounts, hasCardNumber, maskCardNumbers, SentenceGate } from "./text"
import { ToolContext, runTool, toolDefinitions, type ProductCard, type SessionFacts } from "./tools"
import { addUsage, costOf, dayKey, usageOfDay } from "./usage"

/** DML `json` columns are typed as objects; arrays are stored fine */
const json = (v: unknown) => v as Record<string, unknown>

export type ChatEvent =
  | { type: "start"; message_id: string }
  | { type: "delta"; text: string }
  | { type: "products"; items: ProductCard[] }
  | { type: "handoff"; url: string; reason: string }
  | { type: "notice"; code: "amount_removed" | "card_number" | "over_budget" | "turns_exhausted" | "provider_error" | "refusal" }
  | { type: "done"; message_id: string; turns_left: number; handoff: boolean }

export type TurnInput = {
  container: MedusaContainer
  sessionId: string
  text: string
  page: string | null
  publishableKey: string | null
  emit: (e: ChatEvent) => void
  signal?: AbortSignal
}

export class ChatRefused extends Error {
  constructor(
    readonly code: "session_not_found" | "over_budget" | "turns_exhausted" | "disabled" | "message_too_long",
    message?: string
  ) {
    super(message ?? code)
  }
}

export const FALLBACK: Record<string, Record<string, string>> = {
  amount_removed: { id: "Untuk harga atau angka pastinya, silakan cek halaman produk atau tanya CS kami lewat tombol WhatsApp.", en: "For exact prices or figures, please check the product page or ask our team via the WhatsApp button." },
  card_number: { id: "Demi keamanan, jangan kirim nomor kartu atau data pembayaran di chat ini. Pembayaran hanya lewat halaman checkout resmi.", en: "For your safety, please do not share card numbers or payment details in this chat. Payment only happens on the official checkout page." },
  empty: { id: "Maaf, saya belum bisa menjawab itu. Silakan hubungi CS kami lewat tombol WhatsApp.", en: "Sorry, I cannot answer that right now. Please reach our team via the WhatsApp button." },
  provider_error: { id: "Asisten sedang tidak bisa menjawab. Silakan coba lagi sebentar lagi atau hubungi CS lewat WhatsApp.", en: "The assistant cannot answer right now. Please try again shortly or contact our team on WhatsApp." },
}
export const fallbackText = (key: keyof typeof FALLBACK, locale: string) => pick(FALLBACK[key], locale, "en")

type StoredMessage = { id: string; role: "user" | "assistant"; content: string; tool_calls: unknown; products: unknown; flagged: unknown; created_at: Date }

const service = (c: MedusaContainer) => c.resolve<AiChatModuleService>(AI_CHAT_MODULE)

/** Budget for today: Admin setting, else plugin option */
export const dailyBudget = (options: ResolvedOptions, settings: Settings) => settings.daily_budget_usd ?? options.budget.daily_usd

export async function overBudget(container: MedusaContainer, options: ResolvedOptions, settings: Settings): Promise<boolean> {
  const budget = dailyBudget(options, settings)
  if (budget <= 0) return false
  const row = await usageOfDay(container, dayKey(options.budget.timezone))
  return Number(row?.cost_usd ?? 0) >= budget
}

/** One customer message → one streamed assistant answer, persisted. */
export async function runTurn(input: TurnInput): Promise<void> {
  const { container, emit } = input
  const options = getOptions(container)
  const logger = container.resolve<Logger>(ContainerRegistrationKeys.LOGGER)
  const settings = await getSettings(container)
  if (!settings.enabled) throw new ChatRefused("disabled")
  const s = service(container)
  const [session] = await s.listChatSessions({ id: input.sessionId }, { take: 1 })
  if (!session) throw new ChatRefused("session_not_found")
  const locale = session.locale
  const day = dayKey(options.budget.timezone)

  if (session.turns >= options.limits.max_turns) throw new ChatRefused("turns_exhausted")
  if (await overBudget(container, options, settings)) {
    await addUsage(container, day, { refused: 1 }).catch(() => undefined)
    throw new ChatRefused("over_budget")
  }

  const text = input.text.trim()
  if (!text || text.length > options.limits.max_message_chars) throw new ChatRefused("message_too_long")

  const facts: SessionFacts = { id: session.id, locale, country_code: session.country_code, region_id: session.region_id, currency_code: session.currency_code, path_prefix: session.path_prefix ?? "" }
  const started = Date.now()
  const turnsLeft = options.limits.max_turns - session.turns - 1

  // Card numbers never reach the model or the database
  if (hasCardNumber(text)) {
    const reply = fallbackText("card_number", locale)
    const userMsg = await s.createChatMessages({ session_id: session.id, role: "user", content: maskCardNumbers(text), flagged: json(["card_number"]) })
    const msg = await s.createChatMessages({ session_id: session.id, role: "assistant", content: reply, flagged: json(["card_number"]), latency_ms: Date.now() - started })
    emit({ type: "start", message_id: msg.id })
    emit({ type: "notice", code: "card_number" })
    emit({ type: "delta", text: reply })
    await s.updateChatSessions({ id: session.id, turns: session.turns + 1, last_message_at: new Date() })
    emit({ type: "done", message_id: msg.id, turns_left: turnsLeft, handoff: false })
    void userMsg
    return
  }

  const ctx = new ToolContext(container, options, logger, facts, input.publishableKey)
  const history = (await s.listChatMessages({ session_id: session.id }, { order: { created_at: "ASC" }, take: 200 })) as unknown as StoredMessage[]

  // Numbers the customer or earlier (guarded) answers and tool results already contained are allowed
  for (const m of history) {
    for (const n of extractAmounts(m.content)) ctx.numbers.add(n)
    if (Array.isArray(m.tool_calls)) for (const c of m.tool_calls as { result?: string; error?: boolean }[]) if (c.result && !c.error) ctx.allowNumbersFrom(c.result)
  }
  for (const n of extractAmounts(text)) ctx.numbers.add(n)

  const userMsg = await s.createChatMessages({ session_id: session.id, role: "user", content: text })
  const provider = getProvider(container)
  const tools = toolDefinitions(ctx)

  // Prompt: summary + the last N messages; summarise more when the last prompt grew past the threshold
  let summary = session.summary ?? null
  let recent = history.slice(session.summarized_until ? history.findIndex((m) => m.id === session.summarized_until) + 1 : 0)
  const needSummary = recent.length > options.limits.history_messages || session.last_prompt_tokens > options.limits.summarize_after_tokens
  if (needSummary && recent.length > 4) {
    const keep = 4
    const older = recent.slice(0, recent.length - keep)
    try {
      summary = await summarise(provider, summary, older, options.limits.max_output_tokens)
      await s.updateChatSessions({ id: session.id, summary, summarized_until: older[older.length - 1].id })
      recent = recent.slice(recent.length - keep)
    } catch (e) {
      logger.warn(`[ai-chat] summary failed, history truncated instead: ${(e as Error).message}`)
      recent = recent.slice(recent.length - options.limits.history_messages)
    }
  }
  const system = buildSystem({ options, settings, session: facts, summary, page: input.page, tools: tools.map((t) => t.name), turnsLeft })
  const turns: ChatTurn[] = recent.map((m) => ({ role: m.role, content: m.role === "user" ? `<customer_message>${asData(m.content)}</customer_message>` : m.content }))
  turns.push({ role: "user", content: `<customer_message>${asData(text)}</customer_message>` })

  const estimate = estimateTokens(system.stable + system.dynamic + JSON.stringify(tools) + JSON.stringify(turns))
  if (estimate > options.limits.max_prompt_tokens) {
    // Should not happen with the limits above; refuse rather than pay the long-context rate
    await s.deleteChatMessages([userMsg.id])
    throw new ChatRefused("message_too_long", `prompt estimate ${estimate} > ${options.limits.max_prompt_tokens}`)
  }

  const assistantId = `pending`
  emit({ type: "start", message_id: assistantId })
  let answer = ""
  const gate = new SentenceGate(ctx.numbers, (t) => {
    answer += t
    emit({ type: "delta", text: t })
  })
  let usage: Usage = emptyUsage()
  let stop: string = "end_turn"
  let providerError: string | null = null
  const messages: ChatTurn[] = [...turns]

  try {
    for (let round = 0; ; round++) {
      const parts: ContentPart[] = []
      const results: ContentPart[] = []
      let roundText = ""
      for await (const ev of provider.stream({ system, messages, tools, max_tokens: options.limits.max_output_tokens, signal: input.signal })) {
        if (ev.type === "text") {
          roundText += ev.text
          gate.push(ev.text)
        } else if (ev.type === "tool_use") {
          parts.push({ type: "tool_use", id: ev.id, name: ev.name, input: ev.input })
        } else if (ev.type === "done") {
          usage = sumUsage(usage, ev.usage)
          stop = ev.stop_reason
        }
      }
      if (roundText) parts.unshift({ type: "text", text: roundText })
      const calls = parts.filter((p): p is Extract<ContentPart, { type: "tool_use" }> => p.type === "tool_use")
      if (!calls.length || stop === "refusal" || stop === "max_tokens") break
      if (round >= options.limits.max_tool_rounds) {
        logger.warn(`[ai-chat] ${session.id}: tool rounds exhausted`)
        break
      }
      for (const c of calls) {
        const result = await runTool(ctx, c.name, c.input)
        results.push({ type: "tool_result", tool_use_id: c.id, content: result })
      }
      messages.push({ role: "assistant", content: parts }, { role: "user", content: results })
      gate.flush()
      if (answer && !/\s$/.test(answer)) {
        answer += " "
        emit({ type: "delta", text: " " })
      }
    }
  } catch (e) {
    providerError = (e as Error).message
    logger.error(`[ai-chat] ${session.id}: provider failed: ${providerError}`)
  }
  gate.flush()

  const flags = new Set<string>(gate.flags)
  if (stop === "refusal") {
    flags.add("refusal")
    emit({ type: "notice", code: "refusal" })
  }
  if (providerError) {
    flags.add("provider_error")
    emit({ type: "notice", code: "provider_error" })
    if (!answer.trim()) {
      const t = fallbackText("provider_error", locale)
      answer = t
      emit({ type: "delta", text: t })
    }
  }
  if (gate.flags.has("amount")) {
    emit({ type: "notice", code: "amount_removed" })
    const t = (answer.trim() ? " " : "") + fallbackText("amount_removed", locale)
    answer += t
    emit({ type: "delta", text: t })
  }
  if (!answer.trim()) {
    const t = fallbackText("empty", locale)
    answer = t
    emit({ type: "delta", text: t })
  }

  // Product cards: the products the answer names, else the latest search results
  const named = [...ctx.products.values()].filter((p) => answer.toLowerCase().includes(p.title.toLowerCase()) || answer.includes(p.handle))
  const cards = (named.length ? named : ctx.lastSearch).slice(0, 4)
  if (cards.length) emit({ type: "products", items: cards })
  if (ctx.handoff) emit({ type: "handoff", url: ctx.handoff.url, reason: ctx.handoff.reason })

  const cost = costOf(usage, options.pricing)
  const msg = await s.createChatMessages({
    session_id: session.id,
    role: "assistant",
    content: answer.trim(),
    tool_calls: ctx.calls.length ? json(ctx.calls) : null,
    products: cards.length ? json(cards) : null,
    flagged: flags.size ? json([...flags]) : null,
    handoff: !!ctx.handoff,
    input_tokens: usage.input_tokens + usage.cache_read_tokens + usage.cache_write_tokens,
    output_tokens: usage.output_tokens,
    cost_usd: cost,
    latency_ms: Date.now() - started,
    metadata: gate.removed.length ? { removed: gate.removed.slice(0, 5) } : null,
  })
  await s.updateChatSessions({
    id: session.id,
    turns: session.turns + 1,
    input_tokens: session.input_tokens + usage.input_tokens,
    output_tokens: session.output_tokens + usage.output_tokens,
    cache_read_tokens: session.cache_read_tokens + usage.cache_read_tokens,
    cache_write_tokens: session.cache_write_tokens + usage.cache_write_tokens,
    cost_usd: Number(session.cost_usd ?? 0) + cost,
    last_prompt_tokens: usage.input_tokens + usage.cache_read_tokens + usage.cache_write_tokens,
    last_message_at: new Date(),
  })
  await addUsage(container, day, { cost_usd: cost, turns: 1, ...usage }).catch((e) => logger.warn(`[ai-chat] usage not recorded: ${(e as Error).message}`))
  emit({ type: "done", message_id: msg.id, turns_left: turnsLeft, handoff: !!ctx.handoff })
}

async function summarise(provider: ReturnType<typeof getProvider>, previous: string | null, older: StoredMessage[], maxTokens: number): Promise<string> {
  const transcript = older.map((m) => `${m.role === "user" ? "Customer" : "Assistant"}: ${asData(m.content)}`).join("\n")
  const content = `${previous ? `Earlier summary:\n${previous}\n\n` : ""}Conversation:\n${transcript}`
  let out = ""
  for await (const ev of provider.stream({ system: { stable: SUMMARY_SYSTEM, dynamic: "" }, messages: [{ role: "user", content }], tools: [], max_tokens: Math.min(400, maxTokens) })) {
    if (ev.type === "text") out += ev.text
  }
  return out.trim().slice(0, 2000)
}
