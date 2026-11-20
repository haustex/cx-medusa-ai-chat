// Demo data for looking at the assistant in a storefront (after `AC_KEEP=1 node integration-tests/e2e.mjs` left the
// test app running on 9800): an Indonesian region (IDR) next to the US one, three teak products with IDR + USD
// prices and photos from integration-tests/app/static/demo, a friendlier greeting. Writes the publishable key and
// the backend URL to integration-tests/.state/demo.env for the storefront.
//
//   node integration-tests/demo-seed.mjs
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.AC_BASE || "http://127.0.0.1:9800"
const ADMIN = { email: "admin@e2e.test", password: "e2e-password-123" }

const auth = await (await fetch(`${BASE}/auth/user/emailpass`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ADMIN) })).json()
if (!auth.token) throw new Error("login failed")
const api = async (method, url, body) => {
  const res = await fetch(BASE + url, { method, headers: { "content-type": "application/json", authorization: `Bearer ${auth.token}` }, body: body ? JSON.stringify(body) : undefined })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(json).slice(0, 300)}`)
  return json
}

const { sales_channels } = await api("GET", "/admin/sales-channels")
const sc = sales_channels[0]
const { api_keys } = await api("GET", "/admin/api-keys?type=publishable")
const key = api_keys.find((k) => k.sales_channels?.some((s) => s.id === sc.id)) ?? api_keys[0]
const { regions } = await api("GET", "/admin/regions")
let idRegion = regions.find((r) => r.currency_code === "idr")
if (!idRegion) idRegion = (await api("POST", "/admin/regions", { name: "Indonesia", currency_code: "idr", countries: ["id"], payment_providers: ["pp_system_default"] })).region
const { shipping_profiles } = await api("GET", "/admin/shipping-profiles")
const profile = shipping_profiles[0]
const { product_categories } = await api("GET", "/admin/product-categories")
const category = async (name, handle) => product_categories.find((c) => c.handle === handle) ?? (await api("POST", "/admin/product-categories", { name, handle, is_active: true })).product_category
const cats = { talenan: await category("Talenan", "talenan"), tray: await category("Tray", "tray"), mangkuk: await category("Mangkuk", "mangkuk") }

const photo = (file) => (fs.existsSync(path.join(HERE, "app/static/demo", file)) ? `${BASE}/static/demo/${file}` : null)
const PRODUCTS = [
  { title: "Talenan Kayu Jati Bulat", handle: "talenan-kayu-jati-bulat", category: "talenan", thumbnail: photo("board.jpg"), description: "Talenan bulat dari kayu jati tua Jepara, finishing minyak mineral food grade. Tebal 2,5 cm, ada lubang gantung.", material: "Kayu jati", idr: [185000, 245000], usd: [24, 32], sizes: ["30 cm", "35 cm"], weight: 1200 },
  { title: "Tray Kayu Jati Persegi", handle: "tray-kayu-jati-persegi", category: "tray", thumbnail: photo("tray.jpg"), description: "Nampan saji persegi dengan pegangan ukir, kayu jati solid, finishing matte.", material: "Kayu jati", idr: [320000], usd: [42], sizes: ["40 × 28 cm"], weight: 1500 },
  { title: "Mangkuk Kayu Jati", handle: "mangkuk-kayu-jati", category: "mangkuk", thumbnail: photo("bowl.jpg"), description: "Mangkuk bubut dari satu bongkah jati, aman untuk salad dan buah. Diameter 20 cm.", material: "Kayu jati", idr: [150000], usd: [19], sizes: ["20 cm"], weight: 600 },
]
const { products: existing } = await api("GET", "/admin/products?limit=100&fields=id,handle")
for (const p of PRODUCTS) {
  if (existing.some((e) => e.handle === p.handle)) continue
  await api("POST", "/admin/products", {
    title: p.title,
    handle: p.handle,
    description: p.description,
    material: p.material,
    status: "published",
    weight: p.weight,
    thumbnail: p.thumbnail ?? undefined,
    images: p.thumbnail ? [{ url: p.thumbnail }] : undefined,
    shipping_profile_id: profile.id,
    sales_channels: [{ id: sc.id }],
    categories: [{ id: cats[p.category].id }],
    metadata: { finishing: "Minyak mineral food grade", finishing_en: "Food-grade mineral oil", origin: "Jepara", care: "Cuci tangan, keringkan, olesi minyak sebulan sekali", care_en: "Hand wash, dry, oil monthly" },
    options: [{ title: "Ukuran", values: p.sizes }],
    variants: p.sizes.map((size, i) => ({ title: size, options: { Ukuran: size }, manage_inventory: false, prices: [{ currency_code: "idr", amount: p.idr[i] ?? p.idr[0] }, { currency_code: "usd", amount: p.usd[i] ?? p.usd[0] }] })),
  })
  console.log("created", p.handle)
}
await api("POST", "/admin/ai-chat/settings", {
  enabled: true,
  daily_budget_usd: null,
  greeting: { id: "Halo! Saya asisten AI Haus Kayu. Tanya soal produk, harga, ongkir, atau perawatan kayu jati.", en: "Hi! I am the Haus Kayu AI assistant. Ask me about products, prices, shipping or teak care." },
  instructions: "",
  faqs: [
    { question: "Bisa COD?", answer: "Belum. Pembayaran lewat QRIS, virtual account, atau transfer.", locale: "id" },
    { question: "Do you ship to the US?", answer: "Yes, by air freight; see the shipping page for rates.", locale: "en" },
  ],
})
fs.mkdirSync(path.join(HERE, ".state"), { recursive: true })
fs.writeFileSync(path.join(HERE, ".state/demo.env"), `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${key.token}\nNEXT_PUBLIC_MEDUSA_BACKEND_URL=${BASE}\nREGION_ID=${idRegion.id}\n`)
console.log(`demo ready: ${BASE}, key ${key.token.slice(0, 12)}…, regions ${regions.length + (regions.includes(idRegion) ? 0 : 1)}`)
