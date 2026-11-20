import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

const PAGES: Record<string, { type: string; body: string }> = {
  "returns-id": { type: "text/markdown", body: "# Pengembalian\n\nBarang bisa dikembalikan dalam 14 hari setelah diterima selama belum dipakai. Ongkos kirim pengembalian ditanggung pembeli kecuali barang cacat." },
  "returns-en": { type: "text/markdown", body: "# Returns\n\nItems can be returned within 14 days of delivery if unused. Return shipping is paid by the buyer unless the item is faulty." },
  "privacy-en": { type: "text/html", body: "<html><body><h1>Privacy</h1><p>Chat messages are processed by <b>Anthropic</b> and kept for 30 days.</p><script>bad()</script></body></html>" },
}

/** Fake storefront info pages the plugin's get_policy tool reads */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const page = PAGES[req.params.slug]
  if (!page) {
    res.status(404).send("no")
    return
  }
  res.setHeader("content-type", page.type)
  res.send(page.body)
}
