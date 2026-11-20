import { createHash, randomBytes } from "node:crypto"

/** 256 bits of randomness, URL-safe; only its SHA-256 is stored. */
export const newToken = () => randomBytes(32).toString("base64url")
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")
export const hashToken = (token: string) => sha256(`ai-chat:${token}`)
export const hashIp = (ip: string, salt: string) => sha256(`ip:${salt}:${ip}`).slice(0, 32)
export const isValidTokenShape = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(token)
