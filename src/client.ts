/**
 * Types shared with storefronts (import from "medusa-ai-chat/client"): the Store API payloads and SSE events.
 * No runtime code, no Medusa imports.
 */
export type ChatConfig = {
  enabled: boolean
  over_budget: boolean
  locale: string
  name: string
  greeting: string | null
  whatsapp: string | null
  hours: string | null
  privacy_path: string
  limits: { max_message_chars: number; max_turns: number }
  provider: string
}

export type ChatSessionStart = { session: { id: string; token: string; locale: string; turns_left: number } }

export type ChatProductCard = { handle: string; title: string; url: string; thumbnail: string | null; price: string | null; in_stock: boolean | null }

export type ChatNotice = "amount_removed" | "card_number" | "over_budget" | "turns_exhausted" | "provider_error" | "refusal"

export type ChatStreamEvent =
  | { type: "start"; message_id: string }
  | { type: "delta"; text: string }
  | { type: "products"; items: ChatProductCard[] }
  | { type: "handoff"; url: string; reason: string }
  | { type: "notice"; code: ChatNotice }
  | { type: "done"; message_id: string; turns_left: number; handoff: boolean }
  | { type: "error"; code: "session_not_found" | "over_budget" | "turns_exhausted" | "disabled" | "message_too_long" | "failed" }

export type ChatHandoff = { handoff: { url: string; message: string; whatsapp: string } }

/** Parses one SSE frame ("event: x\ndata: {...}") into an event; null for comments/keep-alives. */
export function parseSseFrame(frame: string): ChatStreamEvent | null {
  let event = "message"
  const data: string[] = []
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim()
    else if (line.startsWith("data:")) data.push(line.slice(5).trim())
  }
  if (!data.length) return null
  try {
    const parsed = JSON.parse(data.join("\n")) as Record<string, unknown>
    return { ...parsed, type: (parsed.type as string) ?? event } as ChatStreamEvent
  } catch {
    return null
  }
}

/** Reads a streamed response body frame by frame. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatStreamEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const ev = parseSseFrame(frame)
      if (ev) yield ev
    }
  }
  if (buffer.trim()) {
    const ev = parseSseFrame(buffer)
    if (ev) yield ev
  }
}
