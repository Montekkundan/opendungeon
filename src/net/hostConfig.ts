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
    mode: env.OPENDUNGEON_MODE === "coop" || env.OPENDUNGEON_MODE === "race" ? env.OPENDUNGEON_MODE : "coop",
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

export function lobbyJoinUsageMessage(raw: string) {
  const suffix = raw.trim() ? `\nCould not parse lobby URL: ${raw}` : ""
  return `Usage: opendungeon join <lobby-url>\nExample: opendungeon join http://127.0.0.1:3737${suffix}`
}

export function lobbyInviteErrorMessage(lobbyUrl: string, error: unknown) {
  const reason = errorReason(error)
  if (reason === "timeout") return `Could not reach lobby ${lobbyUrl}. The request timed out; check the host IP, port, and firewall.`
  if (reason === "refused") return `Could not reach lobby ${lobbyUrl}. No host is listening there; start opendungeon-host or use the printed LAN URL.`
  if (reason.startsWith("HTTP ")) return `Lobby ${lobbyUrl} responded with ${reason}. Check that this is an opendungeon-host URL, not the website invite page.`
  return `Could not read lobby invite at ${lobbyUrl}. Check the server URL, port, and whether the host is still running.`
}

export function lobbyInviteMismatchNotice(mode: LobbyMode | undefined, seed: number | undefined, env: Env = process.env) {
  const notices: string[] = []
  const envMode = env.OPENDUNGEON_MODE ?? env.DUNGEON_MODE
  const envSeed = positiveInt(env.OPENDUNGEON_SEED ?? env.DUNGEON_SEED, 0)
  if (mode && envMode && envMode !== mode) notices.push(`mode ${mode} overrides ${envMode}`)
  if (seed && envSeed && envSeed !== seed) notices.push(`seed ${seed} overrides ${envSeed}`)
  return notices.length ? ` Lobby ${notices.join(" and ")}.` : ""
}

export function hostListenErrorMessage(error: unknown, options: Pick<LobbyHostOptions, "bindHost" | "port">) {
  const code = errorCode(error)
  if (code === "EADDRINUSE") return `Could not start opendungeon-host: ${options.bindHost}:${options.port} is already in use. Stop the old host or choose --port <free-port>.`
  if (code === "EADDRNOTAVAIL") return `Could not start opendungeon-host: ${options.bindHost} is not available on this machine. Use --host 127.0.0.1 for same-laptop play or --host 0.0.0.0 for LAN.`
  if (code === "EACCES") return `Could not start opendungeon-host: port ${options.port} needs extra permissions. Choose a port above 1024, such as --port 3737.`
  return `Could not start opendungeon-host on ${options.bindHost}:${options.port}. ${error instanceof Error ? error.message : "Unknown listen error."}`
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

function errorReason(error: unknown) {
  if (typeof error === "object" && error && "name" in error && String(error.name) === "AbortError") return "timeout"
  const message = error instanceof Error ? error.message : String(error)
  if (/HTTP \d+/.test(message)) return message.match(/HTTP \d+/)?.[0] ?? "HTTP error"
  const code = errorCode(error)
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ENOTFOUND" || code === "EHOSTUNREACH") return "refused"
  return message
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error && "code" in error) return String(error.code)
  if (error instanceof Error && typeof error.cause === "object" && error.cause && "code" in error.cause) return String(error.cause.code)
  return ""
}
