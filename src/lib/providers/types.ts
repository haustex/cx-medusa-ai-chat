/** What the chat engine needs from a model API; implemented for Anthropic, OpenAI-compatible APIs and a test mock. */

export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> }

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string }

export type ChatTurn = { role: "user" | "assistant"; content: string | ContentPart[] }

export type Usage = { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number }

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other"

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "done"; stop_reason: StopReason; usage: Usage }

export type CompletionRequest = {
  /** Stable part first (cached by providers that support it), then the per-conversation part */
  system: { stable: string; dynamic: string }
  messages: ChatTurn[]
  tools: ToolDef[]
  max_tokens: number
  signal?: AbortSignal
}

export interface AiProvider {
  readonly id: string
  readonly model: string
  stream(req: CompletionRequest): AsyncIterable<StreamEvent>
}

export const emptyUsage = (): Usage => ({ input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 })

export const addUsage = (a: Usage, b: Usage): Usage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_read_tokens: a.cache_read_tokens + b.cache_read_tokens,
  cache_write_tokens: a.cache_write_tokens + b.cache_write_tokens,
})
