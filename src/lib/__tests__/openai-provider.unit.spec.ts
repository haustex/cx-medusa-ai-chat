import http from "node:http"
import type { AddressInfo } from "node:net"
import { OpenAIProvider } from "../providers/openai"
import type { StreamEvent } from "../providers/types"

const CHUNKS = [
  { choices: [{ delta: { role: "assistant", content: "Hal" } }] },
  { choices: [{ delta: { content: "o!" } }] },
  { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "search_products", arguments: '{"que' } }] } }] },
  { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ry":"talenan"}' } }] } }] },
  { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
  { choices: [], usage: { prompt_tokens: 120, completion_tokens: 9, prompt_tokens_details: { cached_tokens: 100 } } },
]

describe("OpenAI-compatible provider", () => {
  let server: http.Server
  let url: string
  let lastBody: Record<string, unknown> = {}
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = ""
      req.on("data", (c) => (body += c))
      req.on("end", () => {
        lastBody = JSON.parse(body)
        res.writeHead(200, { "content-type": "text/event-stream" })
        for (const c of CHUNKS) res.write(`data: ${JSON.stringify(c)}\n\n`)
        res.end("data: [DONE]\n\n")
      })
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  })
  afterAll(() => server.close())

  it("streams text, assembles tool calls and reads usage", async () => {
    const p = new OpenAIProvider({ apiKey: "k", model: "m", baseURL: url, timeoutMs: 5000 })
    const events: StreamEvent[] = []
    for await (const e of p.stream({ system: { stable: "S", dynamic: "D" }, messages: [{ role: "user", content: "hi" }], tools: [{ name: "search_products", description: "d", input_schema: { type: "object", properties: {} } }], max_tokens: 100 })) events.push(e)
    expect(events).toEqual([
      { type: "text", text: "Hal" },
      { type: "text", text: "o!" },
      { type: "tool_use", id: "call_1", name: "search_products", input: { query: "talenan" } },
      { type: "done", stop_reason: "tool_use", usage: { input_tokens: 20, output_tokens: 9, cache_read_tokens: 100, cache_write_tokens: 0 } },
    ])
    expect(lastBody.messages).toEqual([{ role: "system", content: "S\n\nD" }, { role: "user", content: "hi" }])
    expect((lastBody.tools as unknown[]).length).toBe(1)
  })

  it("maps tool results and assistant tool calls to the chat-completions shape", async () => {
    const p = new OpenAIProvider({ apiKey: "k", model: "m", baseURL: url, timeoutMs: 5000 })
    for await (const _ of p.stream({
      system: { stable: "S", dynamic: "" },
      messages: [
        { role: "user", content: "q" },
        { role: "assistant", content: [{ type: "text", text: "let me check" }, { type: "tool_use", id: "c1", name: "search_products", input: { query: "x" } }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: "{}" }] },
      ],
      tools: [],
      max_tokens: 10,
    })) void _
    expect(lastBody.messages).toEqual([
      { role: "system", content: "S" },
      { role: "user", content: "q" },
      { role: "assistant", content: "let me check", tool_calls: [{ id: "c1", type: "function", function: { name: "search_products", arguments: '{"query":"x"}' } }] },
      { role: "tool", tool_call_id: "c1", content: "{}" },
    ])
  })
})
