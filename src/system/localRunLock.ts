import { createHash, randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { AuthSession } from "../cloud/authStore.js"
import { profileDirectory } from "../game/settingsStore.js"

export type LocalRunLock = {
  path: string
  token: string
  accountLabel: string
  terminalApp: string
}

export type LocalRunLockResult =
  | { allowed: true; kind: "guest"; lock: null; message: string }
  | { allowed: true; kind: "locked"; lock: LocalRunLock; message: string }
  | { allowed: false; kind: "blocked"; lock: null; message: string }

type LockRecord = {
  game: "opendungeon"
  version: 1
  token: string
  pid: number
  accountHash: string
  accountLabel: string
  terminalApp: string
  startedAt: string
}

type EnvLike = Record<string, string | undefined>

type LockOptions = {
  session?: AuthSession | null
  env?: EnvLike
  pid?: number
  now?: () => Date
  isProcessAlive?: (pid: number) => boolean
  staleMs?: number
}

const lockVersion = 1
const defaultStaleMs = 12 * 60 * 60 * 1000

export function activeRunLockDirectory() {
  return process.env.OPENDUNGEON_RUN_LOCK_DIR || join(profileDirectory(), "active-runs")
}

export function acquireLocalRunLock(options: LockOptions = {}): LocalRunLockResult {
  const session = options.session ?? null
  if (!session) {
    return {
      allowed: true,
      kind: "guest",
      lock: null,
      message: "Guest local session; duplicate terminal tabs are allowed.",
    }
  }

  const env = options.env ?? process.env
  const now = options.now ?? (() => new Date())
  const pid = options.pid ?? process.pid
  const isProcessAlive = options.isProcessAlive ?? processAlive
  const accountLabel = accountLabelForSession(session)
  const accountHash = hashValue(authIdentity(session))
  const terminalApp = terminalAppName(env)
  const path = join(activeRunLockDirectory(), `${accountHash}.json`)
  const existing = readLock(path)
  if (existing && !lockIsStale(existing, now(), options.staleMs ?? defaultStaleMs, isProcessAlive)) {
    return {
      allowed: false,
      kind: "blocked",
      lock: null,
      message: `${accountLabel} is already in a game from ${existing.terminalApp}. Use a guest/local profile for another local player.`,
    }
  }

  const token = randomUUID()
  const record: LockRecord = {
    game: "opendungeon",
    version: lockVersion,
    token,
    pid,
    accountHash,
    accountLabel,
    terminalApp,
    startedAt: now().toISOString(),
  }
  mkdirSync(activeRunLockDirectory(), { recursive: true })
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8")
  return {
    allowed: true,
    kind: "locked",
    lock: { path, token, accountLabel, terminalApp },
    message: `${accountLabel} active in ${terminalApp}.`,
  }
}

export function releaseLocalRunLock(lock: LocalRunLock | null) {
  if (!lock || !existsSync(lock.path)) return
  const existing = readLock(lock.path)
  if (existing?.token === lock.token) unlinkSync(lock.path)
}

export function terminalAppName(env: EnvLike = process.env) {
  return cleanLabel(env.OPENDUNGEON_TERMINAL_APP || env.TERM_PROGRAM || env.LC_TERMINAL || env.TERM || "terminal")
}

function readLock(path: string): LockRecord | null {
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<LockRecord>
    if (parsed.game !== "opendungeon" || parsed.version !== lockVersion || !parsed.token || !Number.isInteger(parsed.pid)) return null
    return {
      game: "opendungeon",
      version: lockVersion,
      token: String(parsed.token),
      pid: Number(parsed.pid),
      accountHash: String(parsed.accountHash || ""),
      accountLabel: cleanLabel(parsed.accountLabel || "Signed-in player"),
      terminalApp: cleanLabel(parsed.terminalApp || "terminal"),
      startedAt: validDate(parsed.startedAt) || new Date(0).toISOString(),
    }
  } catch {
    return null
  }
}

function lockIsStale(record: LockRecord, now: Date, staleMs: number, isProcessAlive: (pid: number) => boolean) {
  if (!isProcessAlive(record.pid)) return true
  const startedAt = Date.parse(record.startedAt)
  return Number.isNaN(startedAt) || now.getTime() - startedAt > staleMs
}

function processAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function authIdentity(session: AuthSession) {
  return session.userId || session.email || `${session.provider}:${session.username}`
}

function accountLabelForSession(session: AuthSession) {
  if (session.provider === "github") return `GitHub @${session.username}`
  return session.email || session.username || "Signed-in player"
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24)
}

function cleanLabel(value: unknown) {
  return String(value || "terminal").replace(/[^\w .@-]/g, "").trim().slice(0, 64) || "terminal"
}

function validDate(value: unknown) {
  if (typeof value !== "string") return undefined
  return Number.isNaN(Date.parse(value)) ? undefined : value
}
