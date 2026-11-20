import { pick } from "../options"
import { stripHtml } from "../text"
import type { ToolContext } from "./context"

const cache = new Map<string, { at: number; text: string }>()

export const policyTopics = (ctx: ToolContext) => Object.keys(ctx.options.knowledge.pages)

/** Text of a configured policy/info page (markdown, text or HTML) for the visitor's locale, cached. */
export async function getPolicy(ctx: ToolContext, topic: string) {
  const pages = ctx.options.knowledge.pages[topic]
  const url = pages ? pick(pages, ctx.session.locale, ctx.options.assistant.locales[0]) : ""
  if (!url) return { topic, text: null, note: `no page configured for "${topic}"; offer CS` }
  const ttl = ctx.options.knowledge.cache_seconds * 1000
  const hit = cache.get(url)
  if (hit && Date.now() - hit.at < ttl) return { topic, url, text: hit.text }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ctx.options.tool_timeout_ms)
  try {
    const res = await fetch(url, { headers: { accept: "text/markdown, text/plain, text/html;q=0.8" }, signal: controller.signal })
    if (!res.ok) throw new Error(`${res.status}`)
    const raw = await res.text()
    const type = res.headers.get("content-type") ?? ""
    const text = (type.includes("html") || /^\s*<(!doctype|html)/i.test(raw) ? stripHtml(raw) : raw).trim().slice(0, ctx.options.knowledge.max_chars)
    cache.set(url, { at: Date.now(), text })
    return { topic, url, text }
  } catch (e) {
    ctx.logger.warn(`[ai-chat] policy page ${url} failed: ${(e as Error).message}`)
    if (hit) return { topic, url, text: hit.text }
    return { topic, url, text: null, note: "page could not be read right now; offer CS" }
  } finally {
    clearTimeout(timer)
  }
}

/** For tests */
export const clearPolicyCache = () => cache.clear()
