import { parseSseFrame, readSse } from "../../client"

describe("client SSE helpers", () => {
  it("parses frames", () => {
    expect(parseSseFrame('event: delta\ndata: {"type":"delta","text":"hi"}')).toEqual({ type: "delta", text: "hi" })
    expect(parseSseFrame(": keep-alive")).toBeNull()
  })
  it("reads a stream split at arbitrary points", async () => {
    const text = 'event: start\ndata: {"type":"start","message_id":"m1"}\n\nevent: delta\ndata: {"type":"delta","text":"a"}\n\nevent: done\ndata: {"type":"done","message_id":"m1","turns_left":3,"handoff":false}\n\n'
    const enc = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < text.length; i += 7) c.enqueue(enc.encode(text.slice(i, i + 7)))
        c.close()
      },
    })
    const events: string[] = []
    for await (const e of readSse(body)) events.push(e.type)
    expect(events).toEqual(["start", "delta", "done"])
  })
})
