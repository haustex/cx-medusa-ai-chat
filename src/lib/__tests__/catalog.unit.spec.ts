import { rankByWords, translationLocale } from "../tools/catalog"

const p = (title: string, extra: Partial<Parameters<typeof rankByWords>[0][number]> = {}) => ({ title, handle: title.toLowerCase().replace(/\s+/g, "-"), ...extra })

describe("translationLocale", () => {
  it("uses the configured mapping first", () => {
    expect(translationLocale("en", "us", { en: "en-GB" })).toBe("en-GB")
    expect(translationLocale("EN", "us", { en: "en-GB" })).toBe("en-GB")
  })
  it("derives <locale>-<COUNTRY> for a bare locale", () => {
    expect(translationLocale("en", "us", {})).toBe("en-US")
    expect(translationLocale("id", "id", {})).toBe("id-ID")
  })
  it("keeps the locale when nothing applies", () => {
    expect(translationLocale("en-US", "us", {})).toBe("en-US")
    expect(translationLocale("en", null, {})).toBe("en")
  })
})

describe("rankByWords", () => {
  const catalog = [
    p("Talenan Kayu Jati Bulat", { description: "<p>Talenan bulat dari kayu jati tua.</p>", metadata: { title_en: "Round teak cutting board", secret_note: "x" }, categories: [{ name: "Talenan" }] }),
    p("Mangkuk Kayu Jati", { metadata: { title_en: "Teak bowl" }, categories: [{ name: "Mangkuk" }] }),
    p("Teak serving tray", { description: "Square tray with carved handles", collection: { title: "Kitchen" } }),
  ]
  it("finds products by words in metadata translations", () => {
    expect(rankByWords(catalog, "teak cutting boards").map((x) => x.title)).toEqual(["Talenan Kayu Jati Bulat", "Teak serving tray", "Mangkuk Kayu Jati"])
    expect(rankByWords(catalog, "bowls")[0].title).toBe("Mangkuk Kayu Jati")
  })
  it("ranks title hits above description hits", () => {
    expect(rankByWords(catalog, "tray")[0].title).toBe("Teak serving tray")
  })
  it("returns nothing for unknown words or empty queries", () => {
    expect(rankByWords(catalog, "sofa")).toEqual([])
    expect(rankByWords(catalog, "")).toEqual([])
    expect(rankByWords(catalog, "of")).toEqual([])
  })
})
