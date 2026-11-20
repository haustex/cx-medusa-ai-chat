import type { ToolContext } from "./context"

type RateCard = {
  base_currency: string
  currency: string
  units?: { weight?: string; dimension?: string }
  services: {
    id: string
    name: string
    destination: "province" | "country" | string
    estimate: { min: number; max: number; unit: string } | null
    notice: string | null
    minimum_kg?: number | null
    minimum_charge?: number | null
    zones: { id: string; name: string; rate_per_kg: number | null; destinations: string[] }[]
  }[]
}

let routeMissing = false

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const COUNTRY_ALIASES: Record<string, string> = {
  "united states": "us", usa: "us", "amerika serikat": "us", amerika: "us", america: "us",
  indonesia: "id", singapore: "sg", singapura: "sg", malaysia: "my", australia: "au", japan: "jp", jepang: "jp",
  "united kingdom": "gb", uk: "gb", inggris: "gb", germany: "de", jerman: "de", netherlands: "nl", belanda: "nl", canada: "ca", kanada: "ca",
}

function estimateText(e: { min: number; max: number; unit: string } | null, locale: string) {
  if (!e) return null
  const unit = locale === "id" ? { day: "hari", week: "minggu", month: "bulan" }[e.unit] ?? e.unit : e.unit + (e.max > 1 ? "s" : "")
  return e.min === e.max ? `${e.min} ${unit}` : `${e.min}–${e.max} ${unit}`
}

/**
 * Shipping services and per-kg rates of medusa-fulfillment-zone-rate for a destination (province name for the
 * store's own country, country name or ISO code elsewhere): the same numbers checkout charges. An estimate for
 * `weight_kg` is computed from the zone rate and the service minimum, rounded up to a whole kg.
 */
export async function shippingEstimate(ctx: ToolContext, destination: string, weightKg: number | null) {
  if (routeMissing || !ctx.options.shipping.enabled) return { services: [], note: "shipping rates are not available here; refer to the shipping page or CS" }
  let card: RateCard
  try {
    card = await ctx.storeGet<RateCard>("/store/zone-rate/services", { currency: ctx.session.currency_code ?? undefined, lang: ctx.session.locale })
  } catch (e) {
    if ((e as { status?: number }).status === 404) {
      routeMissing = true
      return { services: [], note: "shipping rates are not available here; refer to the shipping page or CS" }
    }
    throw e
  }
  const wanted = norm(destination || "")
  const wantedCode = COUNTRY_ALIASES[wanted] ?? (wanted.length === 2 ? wanted : null) ?? (ctx.session.country_code && !wanted ? ctx.session.country_code.toLowerCase() : null)
  const matches: Record<string, unknown>[] = []
  for (const s of card.services ?? []) {
    for (const z of s.zones ?? []) {
      const hit = z.destinations.some((d) => {
        const nd = norm(d)
        if (s.destination === "province") return !!wanted && (nd.includes(wanted) || wanted.includes(nd))
        return (!!wantedCode && nd === wantedCode) || (!!wanted && nd === wanted)
      })
      if (!hit || z.rate_per_kg == null) continue
      const minimum = s.minimum_kg ?? 1
      const chargeable = weightKg && weightKg > 0 ? Math.max(Math.ceil(weightKg), Math.ceil(minimum)) : null
      const cost = chargeable ? chargeable * z.rate_per_kg : null
      const costWithMin = cost !== null && s.minimum_charge != null ? Math.max(cost, s.minimum_charge) : cost
      matches.push({
        service: s.name,
        zone: z.name,
        destination_matched: z.destinations.find((d) => norm(d).includes(wanted) || wanted.includes(norm(d)) || norm(d) === wantedCode) ?? destination,
        rate_per_kg: z.rate_per_kg,
        rate_per_kg_formatted: ctx.formatMoney(z.rate_per_kg, card.currency),
        currency: card.currency,
        minimum_kg: minimum,
        ...(s.minimum_charge != null ? { minimum_charge: s.minimum_charge } : {}),
        estimate: s.estimate,
        estimate_text: estimateText(s.estimate, ctx.session.locale),
        ...(s.notice ? { notice: s.notice } : {}),
        ...(costWithMin !== null ? { approx_cost_for_weight: { weight_kg: weightKg, chargeable_kg: chargeable, amount: costWithMin, formatted: ctx.formatMoney(costWithMin, card.currency) } } : {}),
      })
    }
  }
  return {
    destination,
    services: matches.map((m) => ({ name: m.service, ...m })),
    note: matches.length
      ? "Approximate: the exact cost is calculated at checkout from the real parcel weight. Estimates are after dispatch, not from today."
      : "no service covers this destination (or it was not recognised); ask the customer for the province/country or offer CS",
  }
}
