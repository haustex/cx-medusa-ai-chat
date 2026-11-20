/** Pure text helpers: amounts, card numbers, token estimates, HTML stripping, tag escaping. */

/** Rough token count without a tokenizer (conservative for Indonesian/English prose and JSON). */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.2)

export const stripHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

/** Customer text as data inside the prompt: angle brackets neutralised so it can never close or open a tag. */
export const asData = (text: string) => text.replace(/</g, "‹").replace(/>/g, "›")

/**
 * Money amounts in a text, normalised to numbers: "Rp150.000", "Rp 1,5 juta", "150rb", "$12.50", "USD 40",
 * "1.250.000" (grouped digits). Used to compare an answer with what the tools returned.
 */
export function extractAmounts(text: string): number[] {
  const out: number[] = []
  const push = (n: number) => {
    if (Number.isFinite(n) && n > 0) out.push(Math.round(n * 100) / 100)
  }
  const numberOf = (raw: string, unit?: string): number | null => {
    let s = raw.replace(/\s/g, "")
    // "1.250.000" / "1,250,000" grouped; "12.50" / "1,5" decimal
    const groups = s.match(/^(\d{1,3})([.,]\d{3})+$/)
    if (groups) s = s.replace(/[.,]/g, "")
    else if (/^\d+[.,]\d{1,2}$/.test(s)) s = s.replace(",", ".")
    else s = s.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".")
    const n = Number(s)
    if (!Number.isFinite(n)) return null
    const u = (unit ?? "").toLowerCase()
    if (/^(ribu|rb|k)$/.test(u)) return n * 1000
    if (/^(juta|jt|m)$/.test(u)) return n * 1_000_000
    return n
  }
  const currency = /(?:rp|idr|usd|us\$|\$)\s?(\d[\d.,]*)\s*(ribu|rb|juta|jt|k|m)?\b/gi
  const suffixed = /\b(\d[\d.,]*)\s?(ribu|rb|juta|jt)\b/gi
  const grouped = /\b(\d{1,3}(?:[.,]\d{3}){1,4})\b(?![.,]?\d)/g
  for (const re of [currency, suffixed, grouped]) {
    for (const m of text.matchAll(re)) {
      const n = numberOf(m[1], m[2])
      if (n !== null) push(n)
    }
  }
  return out
}

/** Every number in a JSON tool result (prices, quantities…): the allowed set for the amount guard. */
export function numbersIn(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/-?\d+(?:\.\d+)?/g)) {
    const n = Number(m[0])
    if (Number.isFinite(n) && n > 0) out.push(Math.round(n * 100) / 100)
  }
  return out.concat(extractAmounts(text))
}

/** Sentences of a text that mention an amount outside `allowed` (an amount is "allowed" with ±0.5% tolerance). */
export function isAllowedAmount(n: number, allowed: Set<number>): boolean {
  if (allowed.has(n)) return true
  for (const a of allowed) if (Math.abs(a - n) <= Math.max(0.5, a * 0.005)) return true
  return false
}

const luhn = (digits: string) => {
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i])
    if (alt && (d *= 2) > 9) d -= 9
    sum += d
    alt = !alt
  }
  return sum % 10 === 0
}

/** True when the text contains what looks like a payment card number (13–19 digits passing Luhn). */
export function hasCardNumber(text: string): boolean {
  for (const m of text.matchAll(/(?:\d[ -]?){13,19}/g)) {
    const digits = m[0].replace(/\D/g, "")
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return true
  }
  return false
}

/** Card numbers replaced with •••• before anything is stored. */
export const maskCardNumbers = (text: string) =>
  text.replace(/(?:\d[ -]?){13,19}/g, (m) => {
    const digits = m.replace(/\D/g, "")
    const tail = m.match(/[ -]$/)?.[0] ?? ""
    return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? `•••• ${digits.slice(-4)}${tail}` : m
  })

/**
 * Streams text to the visitor sentence by sentence; a sentence that states an amount the tools never returned is
 * dropped and noted, so an invented price is never shown, not even for a moment.
 */
export class SentenceGate {
  private buffer = ""
  public flags = new Set<string>()
  public removed: string[] = []
  constructor(private allowed: Set<number>, private emit: (text: string) => void) {}

  private check(sentence: string): string {
    const amounts = extractAmounts(sentence)
    if (!amounts.length || amounts.every((n) => isAllowedAmount(n, this.allowed))) return sentence
    this.flags.add("amount")
    this.removed.push(sentence.trim())
    return ""
  }

  push(text: string) {
    this.buffer += text
    for (;;) {
      const m = this.buffer.match(/[.!?](?=\s)|\n/)
      if (!m || m.index === undefined) break
      const end = m.index + m[0].length
      const sentence = this.buffer.slice(0, end)
      this.buffer = this.buffer.slice(end)
      const out = this.check(sentence)
      if (out) this.emit(out)
    }
    // A long run without a sentence end and without digits can go out as is
    if (this.buffer.length > 240 && !/\d/.test(this.buffer)) {
      this.emit(this.buffer)
      this.buffer = ""
    }
  }

  flush() {
    if (!this.buffer) return
    const out = this.check(this.buffer)
    this.buffer = ""
    if (out) this.emit(out)
  }
}
