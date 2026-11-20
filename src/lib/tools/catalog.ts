import { languageName } from "../prompt"
import { stripHtml } from "../text"
import type { ProductCard, ToolContext } from "./context"

type Variant = {
  id: string
  title: string | null
  sku?: string | null
  manage_inventory?: boolean
  allow_backorder?: boolean
  inventory_quantity?: number | null
  options?: { value: string; option?: { title?: string } | null }[] | null
  calculated_price?: { calculated_amount?: number | null; original_amount?: number | null; currency_code?: string | null } | null
  weight?: number | null
}
type Product = {
  id: string
  title: string
  handle: string
  subtitle?: string | null
  description?: string | null
  thumbnail?: string | null
  material?: string | null
  weight?: number | null
  length?: number | null
  width?: number | null
  height?: number | null
  metadata?: Record<string, unknown> | null
  variants?: Variant[] | null
  options?: { title: string; values?: { value: string }[] | null }[] | null
  categories?: { name: string }[] | null
  collection?: { title: string } | null
}

const FIELDS = [
  "id,title,handle,subtitle,description,thumbnail,material,weight,length,width,height,metadata",
  "*variants,*variants.calculated_price,+variants.inventory_quantity,*variants.options,*variants.options.option",
  "*options,*options.values,*categories,*collection",
].join(",")

const hidden = (ctx: ToolContext, p: Product) => ctx.options.catalog.hide_when_metadata.some((k) => p.metadata?.[k] === true || p.metadata?.[k] === "true")

function availability(v: Variant): { in_stock: boolean; quantity: number | null } {
  if (v.manage_inventory === false) return { in_stock: true, quantity: null }
  const q = typeof v.inventory_quantity === "number" ? v.inventory_quantity : null
  return { in_stock: (q ?? 0) > 0 || v.allow_backorder === true, quantity: q }
}

function priceRange(ctx: ToolContext, p: Product) {
  const amounts = (p.variants ?? []).map((v) => v.calculated_price?.calculated_amount).filter((a): a is number => typeof a === "number")
  const currency = (p.variants ?? []).find((v) => v.calculated_price?.currency_code)?.calculated_price?.currency_code ?? ctx.session.currency_code
  if (!amounts.length) return { min: null, max: null, currency, formatted: null }
  const min = Math.min(...amounts)
  const max = Math.max(...amounts)
  const f = ctx.formatMoney(min, currency)
  return { min, max, currency, formatted: min === max ? f : `${f} – ${ctx.formatMoney(max, currency)}` }
}

/** Metadata the model may see: short strings, locale-specific keys preferred (`material_en` for "en"), secrets skipped. */
function visibleMetadata(ctx: ToolContext, metadata: Record<string, unknown> | null | undefined, locale: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!metadata) return out
  const suffix = `_${locale}`
  const otherLocale = /_(id|en|de|fr|es|it|nl|pt|ja|zh|ko|ar|ms|th|vi)$/
  for (const [k, v] of Object.entries(metadata)) {
    if (typeof v !== "string" || v.length > 240 || /^https?:\/\//.test(v)) continue
    if (k.startsWith("_") || /secret|hidden|token|password|cost/i.test(k)) continue
    if (k.endsWith(suffix)) out[k.slice(0, -suffix.length)] = v
    else if (otherLocale.test(k)) continue
    else if (!(k in out)) out[k] = v
  }
  return out
}

function card(ctx: ToolContext, p: Product): ProductCard {
  const price = priceRange(ctx, p)
  const vs = p.variants ?? []
  return {
    handle: p.handle,
    title: p.title,
    url: ctx.productUrl(p.handle),
    thumbnail: p.thumbnail ?? null,
    price: price.formatted,
    in_stock: vs.length ? vs.some((v) => availability(v).in_stock) : null,
  }
}

function compact(ctx: ToolContext, p: Product, full: boolean) {
  const price = priceRange(ctx, p)
  const c = card(ctx, p)
  ctx.products.set(p.handle, c)
  const variants = (p.variants ?? []).map((v) => {
    const a = availability(v)
    return {
      title: v.title,
      options: (v.options ?? []).map((o) => `${o.option?.title ?? ""}: ${o.value}`.replace(/^: /, "")),
      price: ctx.formatMoney(v.calculated_price?.calculated_amount, v.calculated_price?.currency_code ?? price.currency),
      in_stock: a.in_stock,
      ...(a.quantity !== null && a.quantity <= 10 ? { quantity_left: a.quantity } : {}),
    }
  })
  const description = stripHtml(p.description ?? "").slice(0, full ? 1200 : 300)
  return {
    title: p.title,
    handle: p.handle,
    url: c.url,
    ...(p.subtitle ? { subtitle: p.subtitle } : {}),
    price: { formatted: price.formatted, currency: price.currency },
    in_stock: c.in_stock,
    ...(description ? { description } : {}),
    ...(p.material ? { material: p.material } : {}),
    ...(p.categories?.length ? { categories: p.categories.map((x) => x.name) } : {}),
    ...(p.collection ? { collection: p.collection.title } : {}),
    ...(full
      ? {
          variants,
          ...(p.weight || p.length || p.width || p.height ? { shipping_weight_g: p.weight ?? null, dimensions_cm: { length: p.length ?? null, width: p.width ?? null, height: p.height ?? null } } : {}),
          details: visibleMetadata(ctx, p.metadata, ctx.session.locale),
        }
      : { variants: variants.length > 1 ? variants.map((v) => `${v.title}: ${v.price ?? "-"}${v.in_stock ? "" : " (out of stock)"}`) : undefined }),
  }
}

let meiliMissing = false

/**
 * The Medusa translation locale for this visitor: the configured mapping, else "<locale>-<COUNTRY>" for a bare
 * two-letter locale (en + us → en-US, Medusa's own convention), else the locale as is.
 */
export function translationLocale(locale: string, countryCode: string | null, mapping: Record<string, string>): string {
  const l = locale.toLowerCase()
  if (mapping[l]) return mapping[l]
  if (/^[a-z]{2}$/.test(l) && countryCode && /^[a-z]{2}$/i.test(countryCode)) return `${l}-${countryCode.toUpperCase()}`
  return locale
}

const tokens = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
    .map((t) => t.replace(/(es|s)$/, ""))

/**
 * Word match of a query against a product's visible text (title, subtitle, handle, description, categories,
 * collection, string metadata such as `title_en`), for the fallback when the native search finds nothing: the
 * native `q` only looks at the untranslated title, so an English query misses an Indonesian catalog even when
 * translations or `*_en` metadata exist. Score = distinct query words found; title hits count double.
 */
export function rankByWords<T extends Pick<Product, "title" | "handle" | "subtitle" | "description" | "metadata" | "categories" | "collection">>(products: T[], query: string): T[] {
  const words = [...new Set(tokens(query))]
  if (!words.length) return []
  const scored = products.map((p) => {
    const title = tokens(`${p.title} ${p.subtitle ?? ""} ${p.handle}`)
    const meta = Object.values(p.metadata ?? {}).filter((v): v is string => typeof v === "string" && v.length <= 240)
    const rest = tokens([stripHtml(p.description ?? ""), ...(p.categories ?? []).map((c) => c.name), p.collection?.title ?? "", ...meta].join(" "))
    let score = 0
    for (const w of words) {
      if (title.some((t) => t === w || t.startsWith(w))) score += 2
      else if (rest.some((t) => t === w || t.startsWith(w))) score += 1
    }
    return { p, score }
  })
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p)
}

async function fetchProducts(ctx: ToolContext, params: Record<string, string | number | undefined>): Promise<Product[]> {
  const base = { region_id: ctx.session.region_id ?? undefined, fields: FIELDS, locale: translationLocale(ctx.session.locale, ctx.session.country_code, ctx.options.catalog.translation_locales), ...params }
  if (!meiliMissing && typeof params.q === "string") {
    try {
      const r = await ctx.storeGet<{ products: Product[] }>("/store/meilisearch/products", { ...base, query: params.q, q: undefined })
      return r.products ?? []
    } catch (e) {
      if ((e as { status?: number }).status === 404) meiliMissing = true
      else ctx.logger.warn(`[ai-chat] meilisearch search failed, native search used: ${(e as Error).message}`)
    }
  }
  const r = await ctx.storeGet<{ products: Product[] }>("/store/products", base)
  return r.products ?? []
}

export async function searchProducts(ctx: ToolContext, query: string) {
  const q = query.trim().slice(0, 120)
  if (!q) return { products: [], note: "empty query" }
  const limit = ctx.options.catalog.search_limit
  let products = (await fetchProducts(ctx, { q, limit: limit + 4 })).filter((p) => !hidden(ctx, p)).slice(0, limit)
  let matched_by: "search" | "words" = "search"
  if (!products.length && ctx.options.catalog.fallback_scan > 0) {
    const all = (await fetchProducts(ctx, { limit: ctx.options.catalog.fallback_scan })).filter((p) => !hidden(ctx, p))
    products = rankByWords(all, q).slice(0, limit)
    if (products.length) matched_by = "words"
  }
  const cards = products.map((p) => card(ctx, p))
  ctx.lastSearch = cards
  return {
    query: q,
    count: products.length,
    matched_by,
    products: products.map((p) => compact(ctx, p, false)),
    ...(products.length ? {} : { note: `no product matches; if the words were not in ${languageName(ctx.options.catalog.language)} try once more with words in that language, otherwise say so and offer the CS button, do not guess` }),
  }
}

export async function getProduct(ctx: ToolContext, handle: string) {
  const h = handle.trim().toLowerCase().slice(0, 120)
  const products = (await fetchProducts(ctx, { handle: h, limit: 1 })).filter((p) => !hidden(ctx, p))
  if (!products.length) return { product: null, note: `no product with handle "${h}"; use search_products` }
  return { product: compact(ctx, products[0], true) }
}
