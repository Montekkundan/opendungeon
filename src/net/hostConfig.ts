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
  const urls: string[] = []
  if (options.publicUrl) urls.push(options.publicUrl)

  if (isWildcardBindHost(options.bindHost)) {
    urls.push(`http://localhost:${options.port}`)
    for (const entries of Object.values(interfaces)) {
      for (const entry of entries ?? []) {
        if (entry.family !== "IPv4" || entry.internal) continue
        urls.push(`http://${entry.address}:${options.port}`)
      }
    }
  } else if (isLoopbackBindHost(options.bindHost)) {
    const loopbackUrl = bindHostUrl(options.bindHost, options.port)
    urls.push(loopbackUrl)
    if (!loopbackUrl.includes("localhost")) urls.push(`http://localhost:${options.port}`)
    if (!loopbackUrl.includes("127.0.0.1") && options.bindHost === "localhost") urls.push(`http://127.0.0.1:${options.port}`)
  } else {
    urls.push(bindHostUrl(options.bindHost, options.port))
  }

  return [...new Set(urls)]
}

export function preferredAdvertisedLobbyUrl(options: LobbyHostOptions, urls = advertisedLobbyUrls(options)) {
  if (options.publicUrl) return options.publicUrl
  if (isWildcardBindHost(options.bindHost)) return urls.find((url) => !isLocalLobbyUrl(url)) || urls[0]
  return urls[0]
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

function isWildcardBindHost(host: string) {
  return host === "0.0.0.0" || host === "::" || host === "[::]"
}

function isLoopbackBindHost(host: string) {
  return host === "localhost" || host === "::1" || host === "[::1]" || host.startsWith("127.")
}

function bindHostUrl(host: string, port: number) {
  if (host === "[::1]") return `http://[::1]:${port}`
  if (host === "::1") return `http://[::1]:${port}`
  return `http://${host}:${port}`
}

function isLocalLobbyUrl(raw: string) {
  try {
    const host = new URL(raw).hostname
    return host === "localhost" || host === "::1" || host.startsWith("127.")
  } catch {
    return false
  }
}
