import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join } from "node:path"
import { normalizeSessionAfterLoad, type GameSession } from "./session.js"
import { tileAt } from "./dungeon.js"
import { readWorldConfig, writeWorldConfig, writeWorldLog } from "../world/worldConfig.js"

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
  slot: "manual" | "autosave" | "imported"
  thumbnail: string[]
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
const autosaveId = "autosave"

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
  return writeSessionSave(session, label, { slot: "manual" })
}

export function saveAutosave(session: GameSession): SaveSummary {
  return writeSessionSave(session, "Autosave", { id: autosaveId, slot: "autosave" })
}

export function loadAutosave(): GameSession {
  return loadSave(autosaveId)
}

export function renameSave(id: string, name: string): SaveSummary {
  const envelope = readEnvelope(id)
  if (!envelope) throw new Error(`Save not found: ${id}`)
  const nextName = cleanSaveName(name)
  envelope.summary = {
    ...normalizeSummary(envelope.summary, id),
    name: nextName,
    path: savePath(id),
  }
  writeEnvelope(envelope.summary.id, envelope)
  return envelope.summary
}

export function exportSave(id: string, targetPath: string): SaveSummary {
  const envelope = readEnvelope(id)
  if (!envelope) throw new Error(`Save not found: ${id}`)
  const path = targetPath.trim()
  if (!path) throw new Error("Export path is required.")
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(envelope, null, 2)}\n`, "utf8")
  return normalizeSummary(envelope.summary, id)
}

export function importSave(sourcePath: string, label = "Imported save"): SaveSummary {
  const parsed = JSON.parse(readFileSync(sourcePath, "utf8")) as Partial<SaveEnvelope>
  const errors = validateSaveEnvelope(parsed)
  if (errors.length) throw new Error(`Invalid save import: ${errors.join(" ")}`)
  const session = deserializeSession(parsed.session as SerializedSession)
  const summary = createSummary(session, cleanSaveName(label || parsed.summary?.name || basename(sourcePath)), {
    id: importedId(session),
    slot: "imported",
  })
  const envelope: SaveEnvelope = {
    game: "opendungeon",
    version: saveVersion,
    summary,
    session: serializeSession(session),
  }
  writeEnvelope(summary.id, envelope)
  return summary
}

export function validateSave(id: string): string[] {
  const path = savePath(id)
  if (!existsSync(path)) return [`Save not found: ${id}`]
  try {
    return validateSaveEnvelope(JSON.parse(readFileSync(path, "utf8")) as Partial<SaveEnvelope>)
  } catch (error) {
    return [error instanceof Error ? error.message : "Save JSON could not be parsed."]
  }
}

export function validateSaveEnvelope(envelope: Partial<SaveEnvelope>): string[] {
  const errors: string[] = []
  if (envelope.game !== "opendungeon") errors.push("Save game marker must be opendungeon.")
  if (envelope.version !== saveVersion) errors.push(`Save version must be ${saveVersion}.`)
  if (!envelope.summary || typeof envelope.summary !== "object") errors.push("Save summary is missing.")
  if (!envelope.session || typeof envelope.session !== "object") errors.push("Save session is missing.")
  if (envelope.summary && typeof envelope.summary === "object") {
    const summary = envelope.summary as Partial<SaveSummary>
    if (!summary.id || typeof summary.id !== "string") errors.push("Save summary id is missing.")
    if (!summary.name || typeof summary.name !== "string") errors.push("Save summary name is missing.")
    if (!Number.isInteger(summary.seed)) errors.push("Save summary seed is missing.")
  }
  if (envelope.session && typeof envelope.session === "object") {
    const session = envelope.session as Partial<SerializedSession>
    if (!Number.isInteger(session.seed)) errors.push("Save session seed is missing.")
    if (!session.hero || typeof session.hero !== "object") errors.push("Save session hero is missing.")
    if (!session.dungeon || typeof session.dungeon !== "object") errors.push("Save session dungeon is missing.")
  }
  return errors
}

function writeSessionSave(session: GameSession, label: string, options: { id?: string; slot: SaveSummary["slot"] }): SaveSummary {
  ensureSaveDirectory()
  writeWorldConfig(session.world)
  writeWorldLog(session.world.worldId, session.worldLog)
  const summary = createSummary(session, label, options)
  const envelope: SaveEnvelope = {
    game: "opendungeon",
    version: saveVersion,
    summary,
    session: serializeSession(session),
  }

  writeEnvelope(summary.id, envelope)
  return summary
}

export function loadSave(id: string): GameSession {
  const envelope = readEnvelope(id)
  if (!envelope) throw new Error(`Save not found: ${id}`)
  const session = deserializeSession(envelope.session)
  try {
    session.world = readWorldConfig(session.world.worldId)
  } catch {
    // Keep the save-embedded world for offline and pre-world-store saves.
  }
  return session
}

export function deleteSave(id: string) {
  unlinkSync(savePath(id))
}

function createSummary(session: GameSession, label: string, options: { id?: string; slot: SaveSummary["slot"] }): SaveSummary {
  const savedAt = new Date().toISOString()
  const id = options.id ?? `${Date.now().toString(36)}-${slug(session.hero.name)}-${Math.random().toString(36).slice(2, 8)}`
  const cleanLabel = cleanSaveName(label)
  const name = `${cleanLabel}: ${session.hero.name} F${session.floor}/${session.finalFloor}`
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
    slot: options.slot,
    thumbnail: createSaveThumbnail(session),
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
  return normalizeSessionAfterLoad({
    ...session,
    visible: new Set(session.visible ?? []),
    seen: new Set(session.seen ?? []),
  })
}

function readEnvelope(id: string): SaveEnvelope | null {
  const path = savePath(id)
  if (!existsSync(path)) return null
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<SaveEnvelope>
  if (validateSaveEnvelope(parsed).some((error) => error.includes("marker") || error.includes("version") || error.includes("session"))) return null
  const session = parsed.session as SerializedSession
  const summary = normalizeSummary(parsed.summary, id, session)
  return {
    game: "opendungeon",
    version: saveVersion,
    summary,
    session,
  }
}

function ensureSaveDirectory() {
  mkdirSync(saveDirectory(), { recursive: true })
}

function savePath(id: string) {
  return join(saveDirectory(), `${safeId(id)}.json`)
}

function writeEnvelope(id: string, envelope: SaveEnvelope) {
  writeFileSync(savePath(id), `${JSON.stringify(envelope, null, 2)}\n`, "utf8")
}

function normalizeSummary(summary: unknown, id: string, session?: SerializedSession): SaveSummary {
  const value = (summary && typeof summary === "object" ? summary : {}) as Partial<SaveSummary>
  const hero = session?.hero
  return {
    id: safeId(value.id || id),
    name: cleanSaveName(value.name || `${value.slot === "autosave" ? "Autosave" : "Save"}: ${hero?.name ?? "Mira"} F${value.floor ?? session?.floor ?? 1}/${value.finalFloor ?? session?.finalFloor ?? 5}`),
    savedAt: validDate(value.savedAt) || new Date(0).toISOString(),
    heroName: cleanSaveName(value.heroName || hero?.name || "Mira"),
    heroTitle: cleanSaveName(value.heroTitle || hero?.title || "Crawler"),
    classId: cleanSaveName(value.classId || hero?.classId || "ranger"),
    mode: cleanSaveName(value.mode || session?.mode || "solo"),
    seed: integer(value.seed, session?.seed ?? 0),
    floor: integer(value.floor, session?.floor ?? 1),
    finalFloor: integer(value.finalFloor, session?.finalFloor ?? 5),
    turn: integer(value.turn, session?.turn ?? 0),
    level: integer(value.level, session?.level ?? 1),
    gold: integer(value.gold, session?.gold ?? 0),
    status: cleanSaveName(value.status || session?.status || "running"),
    path: savePath(value.id || id),
    slot: value.slot === "autosave" || value.slot === "imported" ? value.slot : "manual",
    thumbnail: Array.isArray(value.thumbnail) && value.thumbnail.length ? value.thumbnail.map((row) => String(row).slice(0, 17)).slice(0, 9) : session ? createSaveThumbnail(deserializeSession(session)) : [],
  }
}

function createSaveThumbnail(session: GameSession) {
  const radiusX = 8
  const radiusY = 4
  const rows: string[] = []
  for (let y = session.player.y - radiusY; y <= session.player.y + radiusY; y++) {
    let row = ""
    for (let x = session.player.x - radiusX; x <= session.player.x + radiusX; x++) {
      const actor = session.dungeon.actors.find((candidate) => candidate.position.x === x && candidate.position.y === y)
      if (session.player.x === x && session.player.y === y) row += "@"
      else if (actor) row += actor.kind === "slime" ? "s" : actor.kind === "ghoul" ? "g" : "n"
      else row += tileGlyph(tileAt(session.dungeon, { x, y }))
    }
    rows.push(row)
  }
  return rows
}

function tileGlyph(tile: string) {
  if (tile === "wall") return "#"
  if (tile === "stairs") return ">"
  if (tile === "potion") return "!"
  if (tile === "relic") return "*"
  if (tile === "chest") return "$"
  if (tile === "trap") return "^"
  if (tile === "floor") return "."
  return " "
}

function importedId(session: GameSession) {
  return `${Date.now().toString(36)}-${slug(session.hero.name)}-import-${Math.random().toString(36).slice(2, 8)}`
}

function safeId(id: string) {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "")
  if (!safe) throw new Error("Invalid save id")
  return safe
}

function cleanSaveName(text: string) {
  return text.replace(/[^\w .:/'()-]/g, "").trim().slice(0, 80) || "Save"
}

function validDate(value: unknown) {
  if (typeof value !== "string") return undefined
  return Number.isNaN(Date.parse(value)) ? undefined : value
}

function integer(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.floor(number) : fallback
}

function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || "crawler"
}
