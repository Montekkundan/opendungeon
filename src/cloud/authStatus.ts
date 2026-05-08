import { loadAuthSession, type AuthProvider, type AuthSession } from "./authStore.js"

export type AuthStatusKind = "offline" | "active" | "expiring" | "expired"

export type AuthStatusReport = {
  kind: AuthStatusKind
  loggedIn: boolean
  provider: AuthProvider | "local"
  username: string
  accountLabel: string
  expiresAt?: string
  minutesUntilExpiry?: number
  canRefresh: boolean
  syncAvailable: boolean
  warnings: string[]
}

const refreshWindowMinutes = 30

export function authStatusReport(session: AuthSession | null = loadAuthSession(), now = new Date()): AuthStatusReport {
  if (!session) {
    return {
      kind: "offline",
      loggedIn: false,
      provider: "local",
      username: "local",
      accountLabel: "Local profile",
      canRefresh: false,
      syncAvailable: false,
      warnings: ["Cloud account not signed in; saves stay local."],
    }
  }

  const minutesUntilExpiry = expiryMinutes(session.expiresAt, now)
  const canRefresh = Boolean(session.refreshToken)
  const kind = statusKind(minutesUntilExpiry)
  const warnings = statusWarnings(kind, canRefresh)

  return {
    kind,
    loggedIn: true,
    provider: session.provider,
    username: session.username,
    accountLabel: accountLabel(session),
    expiresAt: session.expiresAt,
    minutesUntilExpiry,
    canRefresh,
    syncAvailable: kind !== "expired",
    warnings,
  }
}

export function formatAuthStatus(report: AuthStatusReport) {
  if (!report.loggedIn) return "Local profile: offline"
  const expiry = report.minutesUntilExpiry === undefined ? "no expiry" : `expires in ${report.minutesUntilExpiry}m`
  const refresh = report.canRefresh ? "refresh ready" : "no refresh token"
  return `${report.accountLabel}: ${report.kind}, ${expiry}, ${refresh}`
}

function expiryMinutes(expiresAt: string | undefined, now: Date) {
  if (!expiresAt) return undefined
  const expires = Date.parse(expiresAt)
  if (Number.isNaN(expires)) return undefined
  return Math.floor((expires - now.getTime()) / 60000)
}

function statusKind(minutesUntilExpiry: number | undefined): AuthStatusKind {
  if (minutesUntilExpiry === undefined) return "active"
  if (minutesUntilExpiry <= 0) return "expired"
  if (minutesUntilExpiry <= refreshWindowMinutes) return "expiring"
  return "active"
}

function statusWarnings(kind: AuthStatusKind, canRefresh: boolean) {
  if (kind === "expired") return [canRefresh ? "Token expired; refresh before syncing." : "Token expired; sign in again before syncing."]
  if (kind === "expiring") return [canRefresh ? "Token expires soon; refresh before syncing." : "Token expires soon; sign in again if syncing fails."]
  return []
}

function accountLabel(session: AuthSession) {
  if (session.provider === "github") return `GitHub @${session.username}`
  if (session.username === "test") return "Local test account"
  return session.username
}
