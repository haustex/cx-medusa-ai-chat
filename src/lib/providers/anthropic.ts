import Anthropic from "@anthropic-ai/sdk"
import type { AiProvider, CompletionRequest, StopReason, StreamEvent, ToolDef } from "./types"

export type AnthropicProviderConfig = { apiKey: string; model: string; effort: "low" | "medium" | "high"; timeoutMs: number; baseURL?: string | null }

const stopReason = (r: string | null): StopReason => (r === "end_turn" || r === "tool_use" || r === "max_tokens" || r === "refusal" ? r : r === "stop_sequence" ? "end_turn" : "other")

/**
 * Anthropic Messages API, streamed. The stable system text and the tool list carry `cache_control` so every turn
 * after the first reads them from the prompt cache; the per-conversation system text comes after the breakpoint.
 * Thinking is left at the model's default (adaptive on current models) with effort "low" for chat.
 */
export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic"
  readonly model: string
  private client: Anthropic
  private effort: "low" | "medium" | "high"

  constructor(config: AnthropicProviderConfig) {
    this.model = config.model
    this.effort = config.effort
    this.client = new Anthropic({ apiKey: config.apiKey, timeout: config.timeoutMs, maxRetries: 1, ...(config.baseURL ? { baseURL: config.baseURL } : {}) })
  }

  private tools(defs: ToolDef[]): Anthropic.Tool[] {
    return defs.map((t, i) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
      strict: true,
      ...(i === defs.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
    }))
  }

  private messages(turns: CompletionRequest["messages"]): Anthropic.MessageParam[] {
    return turns.map((t) => {
      if (typeof t.content === "string") return { role: t.role, content: t.content }
      const content: Anthropic.ContentBlockParam[] = t.content.map((p) => {
        if (p.type === "text") return { type: "text", text: p.text }
        if (p.type === "tool_use") return { type: "tool_use", id: p.id, name: p.name, input: (p.input ?? {}) as Record<string, unknown> }
        return { type: "tool_result", tool_use_id: p.tool_use_id, content: p.content }
      })
      return { role: t.role, content }
    })
  }

  async *stream(req: CompletionRequest): AsyncIterable<StreamEvent> {
    const system: Anthropic.TextBlockParam[] = [{ type: "text", text: req.system.stable, cache_control: { type: "ephemeral" } }]
    if (req.system.dynamic) system.push({ type: "text", text: req.system.dynamic })
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: req.max_tokens,
        system,
        tools: req.tools.length ? this.tools(req.tools) : undefined,
        messages: this.messages(req.messages),
        output_config: { effort: this.effort },
      },
      { signal: req.signal }
    )
    const pending = new Map<number, { id: string; name: string; json: string }>()
    for await (const event of stream) {
      if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        pending.set(event.index, { id: event.content_block.id, name: event.content_block.name, json: "" })
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") yield { type: "text", text: event.delta.text }
        else if (event.delta.type === "input_json_delta") {
          const p = pending.get(event.index)
          if (p) p.json += event.delta.partial_json
        }
      } else if (event.type === "content_block_stop") {
        const p = pending.get(event.index)
        if (p) {
          pending.delete(event.index)
          let input: unknown = {}
          try {
            input = p.json.trim() ? JSON.parse(p.json) : {}
          } catch {
            input = { __invalid_json: p.json.slice(0, 2000) }
          }
          yield { type: "tool_use", id: p.id, name: p.name, input }
        }
      }
    }
    const final = await stream.finalMessage()
    const u = final.usage
    yield {
      type: "done",
      stop_reason: stopReason(final.stop_reason),
      usage: {
        input_tokens: u.input_tokens ?? 0,
        output_tokens: u.output_tokens ?? 0,
        cache_read_tokens: u.cache_read_input_tokens ?? 0,
        cache_write_tokens: u.cache_creation_input_tokens ?? 0,
      },
    }
  }
}
