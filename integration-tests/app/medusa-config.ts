import path from "node:path"
import { defineConfig } from "@medusajs/framework/utils"

// Test app for the E2E suite. Only started through scripts/guard.mjs, which on
// the Haus Kayu host allows nothing but the ac-spike-* containers and ports 9800+.
const pluginDir = process.env.AC_PLUGIN_DIR || path.resolve(__dirname, "../..")
const base = `http://127.0.0.1:${process.env.PORT || 9800}`

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    workerMode: "shared",
    http: {
      storeCors: "*",
      adminCors: "*",
      authCors: "*",
      jwtSecret: "ac-e2e-jwt",
      cookieSecret: "ac-e2e-cookie",
    },
  },
  admin: { disable: process.env.AC_ADMIN !== "1", backendUrl: "/" },
  plugins: [
    {
      resolve: pluginDir,
      options: {
        provider: { id: (process.env.AC_PROVIDER as "mock" | "anthropic") || "mock", model: process.env.AC_MODEL || undefined },
        store: { name: "Haus Kayu", description: "Teak kitchenware and custom furniture from Jepara.", location: "Jepara, Indonesia" },
        storefront: { url: "https://storefront.e2e.test", custom_path: "/custom", path_prefixes: ["", "/us"] },
        assistant: { name: { id: "Asisten AI Haus Kayu", en: "Haus Kayu AI Assistant" }, greeting: { id: "Halo! Ada yang bisa dibantu?", en: "Hi! How can I help?" }, locales: ["id", "en"] },
        contact: { whatsapp: "6285111663330", hours: { id: "Setiap hari 08.00–21.00 WIB", en: "Every day 8 am–9 pm WIB" } },
        knowledge: { pages: { returns: { id: `${base}/e2e/pages/returns-id`, en: `${base}/e2e/pages/returns-en` }, privacy: { en: `${base}/e2e/pages/privacy-en` } }, cache_seconds: 0 },
        limits: { per_ip: { hour: Number(process.env.AC_RATE_MAX || 100000), day: Number(process.env.AC_RATE_MAX || 100000) }, per_session_minute: Number(process.env.AC_SESSION_RATE || 100), max_turns: 20 },
        budget: { daily_usd: 1, timezone: "UTC" },
        retention_days: 30,
        feed: { enabled: true, admin_url: `${base}/app` },
        backend_url: base,
        showCredit: true,
      },
    },
  ],
  modules: [
    {
      resolve: "@medusajs/medusa/notification",
      options: { providers: [{ resolve: "@medusajs/medusa/notification-local", id: "local", options: { channels: ["feed"] } }] },
    },
  ],
})
