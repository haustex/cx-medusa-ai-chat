import { costOf, dayKey } from "../usage"

describe("usage", () => {
  it("prices a turn including cache writes and reads", () => {
    const pricing = { input: 0.1, output: 0.5, cache_read: 0.01, cache_write: 0.125 }
    expect(costOf({ input_tokens: 1000, output_tokens: 250, cache_read_tokens: 2500, cache_write_tokens: 0 }, pricing)).toBeCloseTo(0.0001 + 0.000125 + 0.000025, 9)
    expect(costOf({ input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 2500 }, pricing)).toBeCloseTo(0.0003125, 9)
    expect(costOf({ input_tokens: 10, output_tokens: 10, cache_read_tokens: 0, cache_write_tokens: 0 }, null)).toBe(0)
  })
  it("counts the day in the budget time zone", () => {
    const at = new Date("2026-11-20T18:30:00Z")
    expect(dayKey("UTC", at)).toBe("2026-11-20")
    expect(dayKey("Asia/Jakarta", at)).toBe("2026-11-21")
    expect(dayKey("Not/AZone", at)).toBe("2026-11-20")
  })
})
