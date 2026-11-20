import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { hashIp } from "./tokens"
import { getOptions } from "./options"

/** The visitor's address: Cloudflare's header, then Express (trust proxy), then the socket. */
export function clientIp(req: MedusaRequest): string {
  const cf = req.headers["cf-connecting-ip"]
  const v = Array.isArray(cf) ? cf[0] : cf
  return v || req.ip || req.socket?.remoteAddress || "unknown"
}

export const clientIpHash = (req: MedusaRequest) => hashIp(clientIp(req), getOptions(req.scope).privacy.ip_salt)

export const publishableKey = (req: MedusaRequest): string | null => {
  const h = req.headers["x-publishable-api-key"]
  const v = Array.isArray(h) ? h[0] : h
  return v || null
}

export const noStore = (res: MedusaResponse) => res.setHeader("Cache-Control", "no-store")

/** Server-sent events on an Express response. */
export class Sse {
  private closed = false
  constructor(private res: MedusaResponse) {
    res.status(200)
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
    res.setHeader("Cache-Control", "no-store, no-transform")
    res.setHeader("Connection", "keep-alive")
    res.setHeader("X-Accel-Buffering", "no")
    res.flushHeaders?.()
    res.write(": ok\n\n")
    res.on("close", () => {
      this.closed = true
    })
  }
  get isClosed() {
    return this.closed
  }
  send(event: string, data: unknown) {
    if (this.closed) return
    this.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }
  end() {
    if (this.closed) return
    this.closed = true
    this.res.end()
  }
}
