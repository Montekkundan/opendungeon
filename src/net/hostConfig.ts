import { networkInterfaces } from "node:os"
import type { LobbyMode } from "./lobbyState.js"

type Env = Record<string, string | undefined>

export type LobbyHostOptions = {
  port: number
  bindHost: string
  seed: number
  mode: LobbyMode
  inviteCode: string
  leaderboardPath: string
  publicUrl: string
}

export function parseLobbyHostArgs(args: string[], env: Env = process.env): LobbyHostOptions {
  const options: LobbyHostOptions = {
    port: positivePort(env.OPENDUNGEON_PORT ?? env.PORT, 3737),
    bindHost: env.OPENDUNGEON_BIND_HOST || env.OPENDUNGEON_HOST || env.HOST || "0.0.0.0",
    seed: positiveInt(env.OPENDUNGEON_SEED, Math.floor(Math.random() * 9_000_000) + 1_000_000),
    mode: env.OPENDUNGEON_MODE === "coop" || env.OPENDUNGEON_MODE === "race" ? env.OPENDUNGEON_MODE : "race",
    inviteCode: "",
    leaderboardPath: env.OPENDUNGEON_LOBBY_LEADERBOARD || "",
    publicUrl: normalizeLobbyBaseUrl(env.OPENDUNGEON_PUBLIC_URL || env.OPENDUNGEON_LOBBY_PUBLIC_URL || ""),
  }

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    const value = args[index + 1]
    if (!value) continue
    if (arg === "--port") {
      options.port = positivePort(value, options.port)
      index++
    } else if (arg === "--host" || arg === "--bind") {
      options.bindHost = value
      index++
    } else if (arg === "--public-url" || arg === "--url") {
      options.publicUrl = normalizeLobbyBaseUrl(value)
      index++
    } else if (arg === "--seed") {
      options.seed = positiveInt(value, options.seed)
      index++
    } else if (arg === "--mode" && (value === "race" || value === "coop")) {
      options.mode = value
      index++
    } else if (arg === "--invite") {
      options.inviteCode = value.replace(/[^\w-]/g, "").slice(0, 16)
      index++
    } else if (arg === "--leaderboard") {
      options.leaderboardPath = value
      index++
    }
  }

  return options
}

export function normalizeLobbyBaseUrl(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  try {
    const url = new URL(withProtocol)
    url.pathname = ""
    url.search = ""
    url.hash = ""
    return url.toString().replace(/\/$/, "")
  } catch {
    return ""
  }
}

export function requestLobbyUrl(hostHeader: string | undefined, options: LobbyHostOptions, forwardedProtocol?: string | string[]) {
  if (options.publicUrl) return options.publicUrl
  const host = hostHeader || `localhost:${options.port}`
  const protocol = Array.isArray(forwardedProtocol) ? forwardedProtocol[0] : forwardedProtocol
  return `${protocol === "https" ? "https" : "http"}://${host}`
}

export function advertisedLobbyUrls(options: LobbyHostOptions, interfaces = networkInterfaces()) {
  const urls = [`http://localhost:${options.port}`]
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue
      urls.push(`http://${entry.address}:${options.port}`)
    }
  }
  if (options.publicUrl) urls.push(options.publicUrl)
  return [...new Set(urls)]
}

export function lobbyJoinCommand(lobbyUrl: string) {
  return `opendungeon join ${lobbyUrl}`
}

export function lobbyEnvCommand(lobbyUrl: string, options: Pick<LobbyHostOptions, "mode" | "seed">) {
  return `OPENDUNGEON_MODE=${options.mode} OPENDUNGEON_SEED=${options.seed} OPENDUNGEON_LOBBY_URL=${lobbyUrl} opendungeon`
}

function positivePort(value: string | undefined, fallback: number) {
  const port = positiveInt(value, fallback)
  return port > 0 && port < 65_536 ? port : fallback
}

function positiveInt(value: string | number | undefined, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback
}
