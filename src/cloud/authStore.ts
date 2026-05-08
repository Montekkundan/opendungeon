import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { profileDirectory } from "../game/settingsStore.js"

export type AuthProvider = "password" | "github"

export type AuthSession = {
  provider: AuthProvider
  username: string
  accessToken: string
  refreshToken?: string
  tokenType: "bearer"
  createdAt: string
  expiresAt?: string
  userId?: string
  email?: string
}

type AuthEnvelope = {
  game: "opendungeon"
  version: 1
  session: AuthSession
}

const authVersion = 1

function authDirectory() {
  return process.env.OPENDUNGEON_AUTH_DIR || join(profileDirectory(), "cloud")
}

export function authSessionPath() {
  return join(authDirectory(), "session.json")
}

export function saveAuthSession(session: AuthSession) {
  mkdirSync(authDirectory(), { recursive: true })
  const envelope: AuthEnvelope = {
    game: "opendungeon",
    version: authVersion,
    session: normalizeSession(session),
  }
  writeFileSync(authSessionPath(), `${JSON.stringify(envelope, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  chmodSync(authSessionPath(), 0o600)
}

function normalizeSession(session: Partial<AuthSession>): AuthSession {
  const accessToken = typeof session.accessToken === "string" ? session.accessToken.trim() : ""
  const username = cleanUsername(session.username)
  if (!accessToken) throw new Error("Auth session is missing an access token.")

  return {
    provider: session.provider === "github" ? "github" : "password",
    username,
    accessToken,
    refreshToken: typeof session.refreshToken === "string" && session.refreshToken.trim() ? session.refreshToken.trim() : undefined,
    tokenType: "bearer",
    createdAt: validDate(session.createdAt) || new Date().toISOString(),
    expiresAt: validDate(session.expiresAt),
    userId: typeof session.userId === "string" && session.userId.trim() ? session.userId.trim() : undefined,
    email: typeof session.email === "string" && session.email.trim() ? session.email.trim() : undefined,
  }
}

function cleanUsername(value: unknown) {
  if (typeof value !== "string") return "opendungeon-user"
  const cleaned = value.replace(/[^\w .-]/g, "").trim().slice(0, 64)
  return cleaned || "opendungeon-user"
}

function validDate(value: unknown) {
  if (typeof value !== "string") return undefined
  return Number.isNaN(Date.parse(value)) ? undefined : value
}
