import type { Logger, MedusaContainer } from "@medusajs/framework/types"
import type { ResolvedOptions } from "../options"
import { numbersIn } from "../text"

export type ProductCard = { handle: string; title: string; url: string; thumbnail: string | null; price: string | null; in_stock: boolean | null }

export type ToolCallRecord = { name: string; input: unknown; result: string; ms: number; error?: boolean }

export type SessionFacts = { id: string; locale: string; country_code: string | null; region_id: string | null; currency_code: string | null; path_prefix: string }

export type Handoff = { url: string; reason: string; message: string; source: "ai" | "button" }

export class ToolContext {
  /** Every number the tools returned this session (plus earlier turns): the amount guard's allowed set */
  readonly numbers = new Set<number>()
  readonly products = new Map<string, ProductCard>()
  lastSearch: ProductCard[] = []
  handoff: Handoff | null = null
  calls: ToolCallRecord[] = []

  constructor(
    readonly container: MedusaContainer,
    readonly options: ResolvedOptions,
    readonly logger: Logger,
    readonly session: SessionFacts,
    readonly publishableKey: string | null
  ) {}

  allowNumbersFrom(text: string) {
    for (const n of numbersIn(text)) this.numbers.add(n)
  }

  productUrl(handle: string) {
    const { url, product_path } = this.options.storefront
    return `${url}${this.session.path_prefix}${product_path.replace("{handle}", encodeURIComponent(handle))}`
  }

  intlLocale() {
    const l = this.session.locale
    return l === "id" ? "id-ID" : l === "en" ? "en-US" : l
  }

  formatMoney(amount: number | null | undefined, currency: string | null | undefined): string | null {
    if (typeof amount !== "number" || !Number.isFinite(amount) || !currency) return null
    const code = currency.toUpperCase()
    try {
      return new Intl.NumberFormat(this.intlLocale(), { style: "currency", currency: code, maximumFractionDigits: code === "IDR" || code === "JPY" || code === "KRW" ? 0 : 2 }).format(amount)
    } catch {
      return `${code} ${amount}`
    }
  }

  /** GET on the own Store API (same publishable key as the visitor); throws on non-2xx. */
  async storeGet<T>(path: string, query: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${this.options.backend_url}${path}`)
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.options.tool_timeout_ms)
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "accept-language": this.session.locale, ...(this.publishableKey ? { "x-publishable-api-key": this.publishableKey } : {}) },
        signal: controller.signal,
      })
      if (!res.ok) {
        const err = new Error(`${path} → ${res.status}`) as Error & { status: number }
        err.status = res.status
        throw err
      }
      return (await res.json()) as T
    } finally {
      clearTimeout(timer)
    }
  }
}
