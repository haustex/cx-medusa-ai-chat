import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getOptions, type ResolvedOptions } from "../options"
import { AnthropicProvider } from "./anthropic"
import { MockProvider } from "./mock"
import { OpenAIProvider } from "./openai"
import type { AiProvider } from "./types"

export * from "./types"

export class ProviderNotConfigured extends Error {}

const cache = new WeakMap<object, AiProvider>()

/** Builds the configured provider once per process. Throws ProviderNotConfigured when the key or model is missing. */
export function getProvider(container: MedusaContainer): AiProvider {
  const options = getOptions(container)
  const hit = cache.get(options)
  if (hit) return hit
  const provider = createProvider(options)
  cache.set(options, provider)
  return provider
}

export function createProvider(options: ResolvedOptions): AiProvider {
  const p = options.provider
  if (p.id === "mock") return new MockProvider()
  const apiKey = process.env[p.api_key_env]
  if (!apiKey) throw new ProviderNotConfigured(`${p.api_key_env} is not set`)
  if (!p.model) throw new ProviderNotConfigured("provider.model is not set")
  if (p.id === "openai") {
    if (!p.base_url) throw new ProviderNotConfigured("provider.base_url is required for the openai provider")
    return new OpenAIProvider({ apiKey, model: p.model, baseURL: p.base_url, timeoutMs: p.timeout_ms })
  }
  return new AnthropicProvider({ apiKey, model: p.model, effort: p.effort, timeoutMs: p.timeout_ms, baseURL: p.base_url })
}

/** True when a chat can be served (key present or mock). Logs the reason once when not. */
export function providerReady(container: MedusaContainer): boolean {
  try {
    getProvider(container)
    return true
  } catch (e) {
    try {
      container.resolve(ContainerRegistrationKeys.LOGGER).warn(`[ai-chat] disabled: ${(e as Error).message}`)
    } catch {}
    return false
  }
}
