import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { defaultDiceSkin, diceSkinIds, type DiceSkinId } from "../assets/diceSkins.js"

export type ControlScheme = "hybrid" | "arrows" | "vim"
export type BackgroundFx = "low" | "normal" | "dense"
export type TileScalePreference = "overview" | "wide" | "medium" | "close"
export type ToastDurationPreference = "short" | "normal" | "long"
export type ToastDensityPreference = "quiet" | "normal" | "verbose"
export type UiScalePreference = "compact" | "normal" | "large"
export type ContrastPalettePreference = "standard" | "bright" | "mono"

export type UserSettings = {
  username: string
  githubUsername: string
  cloudProvider: "local" | "github"
  controlScheme: ControlScheme
  highContrast: boolean
  contrastPalette: ContrastPalettePreference
  reduceMotion: boolean
  uiScale: UiScalePreference
  toastDuration: ToastDurationPreference
  toastDensity: ToastDensityPreference
  showUi: boolean
  showMinimap: boolean
  startWithTutorial: boolean
  backgroundFx: BackgroundFx
  tileScale: TileScalePreference
  diceSkin: DiceSkinId
  music: boolean
  sound: boolean
  muteAudio: boolean
  masterVolume: number
  musicVolume: number
  sfxVolume: number
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
  contrastPalette: "standard",
  reduceMotion: false,
  uiScale: "normal",
  toastDuration: "normal",
  toastDensity: "normal",
  showUi: true,
  showMinimap: true,
  startWithTutorial: true,
  backgroundFx: "normal",
  tileScale: "wide",
  diceSkin: defaultDiceSkin,
  music: true,
  sound: true,
  muteAudio: false,
  masterVolume: 0.8,
  musicVolume: 0.7,
  sfxVolume: 0.8,
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
  const hasAudioSchema = hasStoredAudioSchema(settings)
  const contrastPalette = asContrastPalette(settings.contrastPalette, settings.highContrast)
  return {
    username: cleanName(settings.username, defaultSettings.username),
    githubUsername: cleanName(settings.githubUsername, ""),
    cloudProvider: settings.cloudProvider === "github" ? "github" : "local",
    controlScheme: asControlScheme(settings.controlScheme),
    highContrast: Boolean(settings.highContrast) || contrastPalette !== "standard",
    contrastPalette,
    reduceMotion: Boolean(settings.reduceMotion),
    uiScale: asUiScale(settings.uiScale),
    toastDuration: asToastDuration(settings.toastDuration),
    toastDensity: asToastDensity(settings.toastDensity),
    showUi: settings.showUi !== false,
    showMinimap: settings.showMinimap !== false,
    startWithTutorial: settings.startWithTutorial !== false,
    backgroundFx: asBackgroundFx(settings.backgroundFx),
    tileScale: asTileScale(settings.tileScale),
    diceSkin: asDiceSkin(settings.diceSkin),
    music: hasAudioSchema ? settings.music !== false : defaultSettings.music,
    sound: hasAudioSchema ? settings.sound !== false : defaultSettings.sound,
    muteAudio: hasAudioSchema ? Boolean(settings.muteAudio) : defaultSettings.muteAudio,
    masterVolume: asVolume(settings.masterVolume, defaultSettings.masterVolume),
    musicVolume: asVolume(settings.musicVolume, defaultSettings.musicVolume),
    sfxVolume: asVolume(settings.sfxVolume, defaultSettings.sfxVolume),
  }
}

function hasStoredAudioSchema(settings: Partial<UserSettings>) {
  return "muteAudio" in settings || "masterVolume" in settings || "musicVolume" in settings || "sfxVolume" in settings
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

function asToastDuration(value: unknown): ToastDurationPreference {
  return value === "short" || value === "long" || value === "normal" ? value : defaultSettings.toastDuration
}

function asToastDensity(value: unknown): ToastDensityPreference {
  return value === "quiet" || value === "verbose" || value === "normal" ? value : defaultSettings.toastDensity
}

function asUiScale(value: unknown): UiScalePreference {
  return value === "compact" || value === "large" || value === "normal" ? value : defaultSettings.uiScale
}

function asContrastPalette(value: unknown, highContrast: unknown): ContrastPalettePreference {
  if (value === "bright" || value === "mono" || value === "standard") return value
  return highContrast ? "bright" : defaultSettings.contrastPalette
}

function asDiceSkin(value: unknown): DiceSkinId {
  return typeof value === "string" && (diceSkinIds as readonly string[]).includes(value) ? (value as DiceSkinId) : defaultDiceSkin
}

function asVolume(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback
}
