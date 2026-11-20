import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

type CacheLike = { get<T>(key: string): Promise<T | null>; set(key: string, data: unknown, ttl?: number): Promise<void> }

type Bucket = { count: number; reset: number }
const memory = new Map<string, Bucket>()
let lastSweep = 0

function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [k, b] of memory) if (b.reset <= now) memory.delete(k)
}

function cacheOf(container: MedusaContainer): CacheLike | null {
  try {
    const c = container.resolve(Modules.CACHE) as Partial<CacheLike> | undefined
    return c && typeof c.get === "function" && typeof c.set === "function" ? (c as CacheLike) : null
  } catch {
    return null
  }
}

/**
 * Fixed-window counter per key, shared through the Cache Module when the store has one (Redis in production),
 * in memory otherwise. Returns false (and does not count) once `max` is reached in the window.
 */
export async function take(container: MedusaContainer, key: string, max: number, windowSeconds: number): Promise<boolean> {
  if (max <= 0) return true
  const now = Date.now()
  const window = Math.floor(now / (windowSeconds * 1000))
  const cacheKey = `ac:rl:${key}:${window}`
  const cache = cacheOf(container)
  if (cache) {
    const current = Number((await cache.get<number>(cacheKey)) ?? 0)
    if (current >= max) return false
    await cache.set(cacheKey, current + 1, windowSeconds + 1)
    return true
  }
  sweep(now)
  const b = memory.get(cacheKey) ?? { count: 0, reset: (window + 1) * windowSeconds * 1000 }
  if (b.count >= max) return false
  b.count++
  memory.set(cacheKey, b)
  return true
}

/** For tests: forget every in-memory counter. */
export const resetRateLimits = () => memory.clear()
