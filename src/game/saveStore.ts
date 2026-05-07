import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { GameSession } from "./session.js"

export type SaveSummary = {
  id: string
  name: string
  savedAt: string
  heroName: string
  heroTitle: string
  classId: string
  mode: string
  seed: number
  floor: number
  finalFloor: number
  turn: number
  level: number
  gold: number
  status: string
  path: string
}

type SerializedSession = Omit<GameSession, "visible" | "seen"> & {
  visible: string[]
  seen: string[]
}

type SaveEnvelope = {
  game: "opendungeon"
  version: 1
  summary: SaveSummary
  session: SerializedSession
}

const saveVersion = 1

export function saveDirectory() {
  return process.env.OPENDUNGEON_SAVE_DIR || join(homedir(), ".opendungeon", "saves")
}

export function listSaves(): SaveSummary[] {
  ensureSaveDirectory()
  return readdirSync(saveDirectory())
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      try {
        const envelope = readEnvelope(file.slice(0, -5))
        return envelope ? [envelope.summary] : []
      } catch {
        return []
      }
    })
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
}

export function saveSession(session: GameSession, label = "Manual save"): SaveSummary {
  ensureSaveDirectory()
  const summary = createSummary(session, label)
  const envelope: SaveEnvelope = {
    game: "opendungeon",
    version: saveVersion,
    summary,
    session: serializeSession(session),
  }

  writeFileSync(savePath(summary.id), `${JSON.stringify(envelope, null, 2)}\n`, "utf8")
  return summary
}

export function loadSave(id: string): GameSession {
  const envelope = readEnvelope(id)
  if (!envelope) throw new Error(`Save not found: ${id}`)
  return deserializeSession(envelope.session)
}

export function deleteSave(id: string) {
  unlinkSync(savePath(id))
}

function createSummary(session: GameSession, label: string): SaveSummary {
  const savedAt = new Date().toISOString()
  const id = `${Date.now().toString(36)}-${slug(session.hero.name)}-${Math.random().toString(36).slice(2, 8)}`
  const name = `${label}: ${session.hero.name} F${session.floor}/${session.finalFloor}`
  return {
    id,
    name,
    savedAt,
    heroName: session.hero.name,
    heroTitle: session.hero.title,
    classId: session.hero.classId,
    mode: session.mode,
    seed: session.seed,
    floor: session.floor,
    finalFloor: session.finalFloor,
    turn: session.turn,
    level: session.level,
    gold: session.gold,
    status: session.status,
    path: savePath(id),
  }
}

function serializeSession(session: GameSession): SerializedSession {
  return {
    ...session,
    visible: [...session.visible],
    seen: [...session.seen],
  }
}

function deserializeSession(session: SerializedSession): GameSession {
  return {
    ...session,
    visible: new Set(session.visible ?? []),
    seen: new Set(session.seen ?? []),
  }
}

function readEnvelope(id: string): SaveEnvelope | null {
  const path = savePath(id)
  if (!existsSync(path)) return null
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<SaveEnvelope>
  if (parsed.game !== "opendungeon" || parsed.version !== saveVersion || !parsed.summary || !parsed.session) return null
  return parsed as SaveEnvelope
}

function ensureSaveDirectory() {
  mkdirSync(saveDirectory(), { recursive: true })
}

function savePath(id: string) {
  return join(saveDirectory(), `${safeId(id)}.json`)
}

function safeId(id: string) {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "")
  if (!safe) throw new Error("Invalid save id")
  return safe
}

function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || "crawler"
}
