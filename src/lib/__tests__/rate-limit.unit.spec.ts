import { resetRateLimits, take } from "../rate-limit"

const container = { resolve: () => { throw new Error("no cache module") } } as never

describe("rate limit (in-memory fallback)", () => {
  beforeEach(() => resetRateLimits())
  it("allows max hits per window, then refuses without counting", async () => {
    const hits: boolean[] = []
    for (let i = 0; i < 8; i++) hits.push(await take(container, "msg:s:acs_1", 6, 60))
    expect(hits).toEqual([true, true, true, true, true, true, false, false])
    expect(await take(container, "msg:s:acs_2", 6, 60)).toBe(true)
  })
  it("max 0 disables the limit", async () => {
    expect(await take(container, "k", 0, 60)).toBe(true)
  })
})
