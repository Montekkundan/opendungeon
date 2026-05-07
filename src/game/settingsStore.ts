import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { defaultDiceSkin, diceSkinIds, type DiceSkinId } from "../assets/diceSkins.js"

export type ControlScheme = "hybrid" | "arrows" | "vim"
export type BackgroundFx = "low" | "normal" | "dense"
export type TileScalePreference = "overview" | "wide" | "medium" | "close"

export type UserSettings = {
  username: string
  githubUsername: string
  cloudProvider: "local" | "github"
  controlScheme: ControlScheme
  highContrast: boolean
  reduceMotion: boolean
  showUi: boolean
  backgroundFx: BackgroundFx
  tileScale: TileScalePreference
  diceSkin: DiceSkinId
  music: boolean
  sound: boolean
}

type ProfileEnvelope = {
  game: "opendungeon"
  version: 1
  settings: UserSettings
}

const profileVersion = 1

export const defaultSettings: UserSettings = {
  username: "local-crawler",
  githubUsername: "",
  cloudProvider: "local",
  controlScheme: "hybrid",
  highContrast: false,
  reduceMotion: false,
  showUi: true,
  backgroundFx: "normal",
  tileScale: "wide",
  diceSkin: defaultDiceSkin,
  music: false,
  sound: true,
}

export function profileDirectory() {
  return process.env.OPENDUNGEON_PROFILE_DIR || join(homedir(), ".opendungeon")
}

export function profilePath() {
  return join(profileDirectory(), "profile.json")
}

export function loadSettings(): UserSettings {
  ensureProfileDirectory()
  if (!existsSync(profilePath())) {
    saveSettings(defaultSettings)
    return { ...defaultSettings }
  }

  try {
    const parsed = JSON.parse(readFileSync(profilePath(), "utf8")) as Partial<ProfileEnvelope>
    if (parsed.game !== "opendungeon" || parsed.version !== profileVersion || !parsed.settings) return { ...defaultSettings }
    return normalizeSettings(parsed.settings)
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(settings: UserSettings) {
  ensureProfileDirectory()
  const envelope: ProfileEnvelope = {
    game: "opendungeon",
    version: profileVersion,
    settings: normalizeSettings(settings),
  }
  writeFileSync(profilePath(), `${JSON.stringify(envelope, null, 2)}\n`, "utf8")
}

function ensureProfileDirectory() {
  mkdirSync(profileDirectory(), { recursive: true })
}

function normalizeSettings(settings: Partial<UserSettings>): UserSettings {
  return {
    username: cleanName(settings.username, defaultSettings.username),
    githubUsername: cleanName(settings.githubUsername, ""),
    cloudProvider: settings.cloudProvider === "github" ? "github" : "local",
    controlScheme: asControlScheme(settings.controlScheme),
    highContrast: Boolean(settings.highContrast),
    reduceMotion: Boolean(settings.reduceMotion),
    showUi: settings.showUi !== false,
    backgroundFx: asBackgroundFx(settings.backgroundFx),
    tileScale: asTileScale(settings.tileScale),
    diceSkin: asDiceSkin(settings.diceSkin),
    music: Boolean(settings.music),
    sound: settings.sound !== false,
  }
}

function cleanName(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback
  const cleaned = value.replace(/[^\w .-]/g, "").trim().slice(0, 24)
  return cleaned || fallback
}

function asControlScheme(value: unknown): ControlScheme {
  return value === "arrows" || value === "vim" || value === "hybrid" ? value : defaultSettings.controlScheme
}

function asBackgroundFx(value: unknown): BackgroundFx {
  return value === "low" || value === "dense" || value === "normal" ? value : defaultSettings.backgroundFx
}

function asTileScale(value: unknown): TileScalePreference {
  if (value === "overview" || value === "wide" || value === "medium" || value === "close") return value
  if (value === "auto" || value === "large") return "medium"
  return defaultSettings.tileScale
}

function asDiceSkin(value: unknown): DiceSkinId {
  return typeof value === "string" && (diceSkinIds as readonly string[]).includes(value) ? (value as DiceSkinId) : defaultDiceSkin
}
