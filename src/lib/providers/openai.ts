import type { AiProvider, CompletionRequest, StopReason, StreamEvent, ToolDef } from "./types"

export type OpenAIProviderConfig = { apiKey: string; model: string; baseURL: string; timeoutMs: number }

type OaMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string }

/**
 * Any OpenAI-compatible `/chat/completions` API (OpenAI, Groq, Together, Ollama, OpenRouter …), streamed over SSE.
 * Usage comes from the final chunk (`stream_options.include_usage`); cached prompt tokens from
 * `prompt_tokens_details.cached_tokens` when the API reports them.
 */
export class OpenAIProvider implements AiProvider {
  readonly id = "openai"
  readonly model: string
  private apiKey: string
  private baseURL: string
  private timeoutMs: number

  constructor(config: OpenAIProviderConfig) {
    this.model = config.model
    this.apiKey = config.apiKey
    this.baseURL = config.baseURL.replace(/\/+$/, "")
    this.timeoutMs = config.timeoutMs
  }

  private messages(req: CompletionRequest): OaMessage[] {
    const out: OaMessage[] = [{ role: "system", content: [req.system.stable, req.system.dynamic].filter(Boolean).join("\n\n") }]
    for (const t of req.messages) {
      if (typeof t.content === "string") {
        out.push({ role: t.role, content: t.content })
        continue
      }
      if (t.role === "assistant") {
        const text = t.content.filter((p) => p.type === "text").map((p) => (p as { text: string }).text).join("")
        const calls = t.content.filter((p) => p.type === "tool_use") as Extract<CompletionRequest["messages"][number]["content"], unknown[]>[number][]
        out.push({
          role: "assistant",
          content: text || null,
          ...(calls.length
            ? { tool_calls: calls.map((c) => (c.type === "tool_use" ? { id: c.id, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) } } : null)).filter((c): c is NonNullable<typeof c> => !!c) }
            : {}),
        })
      } else {
        for (const p of t.content) {
          if (p.type === "tool_result") out.push({ role: "tool", tool_call_id: p.tool_use_id, content: p.content })
          else if (p.type === "text") out.push({ role: "user", content: p.text })
        }
      }
    }
    return out
  }

  private tools(defs: ToolDef[]) {
    return defs.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }))
  }

  async *stream(req: CompletionRequest): AsyncIterable<StreamEvent> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    const onAbort = () => controller.abort()
    req.signal?.addEventListener("abort", onAbort, { once: true })
    try {
      const res = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          stream: true,
          stream_options: { include_usage: true },
          max_tokens: req.max_tokens,
          messages: this.messages(req),
          ...(req.tools.length ? { tools: this.tools(req.tools), tool_choice: "auto" } : {}),
        }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "")
        throw new Error(`openai-compatible API ${res.status}: ${text.slice(0, 300)}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      const calls = new Map<number, { id: string; name: string; args: string }>()
      let finish: string | null = null
      let usage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }
      const handle = function* (this: void, data: string): Generator<StreamEvent> {
        if (data === "[DONE]") return
        let json: Record<string, unknown>
        try {
          json = JSON.parse(data)
        } catch {
          return
        }
        const u = json.usage as { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | undefined
        if (u) {
          const cached = u.prompt_tokens_details?.cached_tokens ?? 0
          usage = { input_tokens: Math.max(0, (u.prompt_tokens ?? 0) - cached), output_tokens: u.completion_tokens ?? 0, cache_read_tokens: cached, cache_write_tokens: 0 }
        }
        const choice = (json.choices as { delta?: Record<string, unknown>; finish_reason?: string | null }[] | undefined)?.[0]
        if (!choice) return
        if (choice.finish_reason) finish = choice.finish_reason
        const delta = choice.delta ?? {}
        if (typeof delta.content === "string" && delta.content) yield { type: "text", text: delta.content }
        const tcs = delta.tool_calls as { index: number; id?: string; function?: { name?: string; arguments?: string } }[] | undefined
        for (const tc of tcs ?? []) {
          const c = calls.get(tc.index) ?? { id: tc.id ?? `call_${tc.index}`, name: "", args: "" }
          if (tc.id) c.id = tc.id
          if (tc.function?.name) c.name += tc.function.name
          if (tc.function?.arguments) c.args += tc.function.arguments
          calls.set(tc.index, c)
        }
      }
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (line.startsWith("data:")) yield* handle(line.slice(5).trim())
        }
      }
      for (const c of [...calls.values()]) {
        let input: unknown = {}
        try {
          input = c.args.trim() ? JSON.parse(c.args) : {}
        } catch {
          input = { __invalid_json: c.args.slice(0, 2000) }
        }
        yield { type: "tool_use", id: c.id, name: c.name, input }
      }
      const stop: StopReason = calls.size ? "tool_use" : finish === "length" ? "max_tokens" : finish === "content_filter" ? "refusal" : finish === "stop" || finish === null ? "end_turn" : "other"
      yield { type: "done", stop_reason: stop, usage }
    } finally {
      clearTimeout(timer)
      req.signal?.removeEventListener("abort", onAbort)
    }
  }
}
