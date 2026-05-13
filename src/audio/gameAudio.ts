import { Audio, type AudioGroup, type AudioSound, type AudioVoice } from "@opentui/core"
import type { UserSettings } from "../game/settingsStore.js"
import {
  audioEvent,
  audioManifest,
  audioTrack,
  audioTrackRuntimePath,
  type AudioEventId,
  type AudioTrackId,
} from "./audioManifest.js"
import { synthesizeSfx } from "./sfxSynth.js"
import dungeonLoopFile from "../../assets/opendungeon-assets/runtime/audio/dungeon-loop.mp3" with { type: "file" }
import titleSettingsLoopFile from "../../assets/opendungeon-assets/runtime/audio/title-settings-loop.mp3" with { type: "file" }

export type AudioSurface = {
  screen: string
  dialog?: string | null
}

type AudioLike = {
  on: Audio["on"]
  isStarted: () => boolean
  start: () => boolean
  loadSound: (data: Uint8Array | ArrayBuffer) => AudioSound | null
  loadSoundFile: (path: string) => Promise<AudioSound | null>
  group: (name: string) => AudioGroup | null
  play: (sound: AudioSound, options?: { volume?: number; pan?: number; loop?: boolean; groupId?: number }) => AudioVoice | null
  stopVoice: (voice: AudioVoice) => boolean
  setGroupVolume: (group: AudioGroup, volume: number) => boolean
  setMasterVolume: (volume: number) => boolean
  dispose: () => void
}

type GameAudioControllerOptions = {
  createAudio?: () => AudioLike
}

export function musicTrackForSurface(surface: AudioSurface): AudioTrackId {
  return surface.screen === "game" ? "dungeon" : "title-settings"
}

export function effectiveMasterVolume(settings: UserSettings) {
  return settings.muteAudio ? 0 : clampVolume(settings.masterVolume)
}

export function effectiveGroupVolumes(settings: UserSettings) {
  return {
    music: settings.muteAudio || !settings.music ? 0 : clampVolume(settings.musicVolume),
    sfx: settings.muteAudio || !settings.sound ? 0 : clampVolume(settings.sfxVolume),
    ui: settings.muteAudio || !settings.sound ? 0 : clampVolume(settings.sfxVolume),
  }
}

export class GameAudioController {
  private readonly createAudio: () => AudioLike
  private audio: AudioLike | null = null
  private currentTrack: AudioTrackId | null = null
  private currentVoice: AudioVoice | null = null
  private status = "Audio ready."
  private loading: Promise<void> | null = null
  private readonly sounds = new Map<AudioTrackId, AudioSound>()
  private readonly eventSounds = new Map<AudioEventId, AudioSound>()
  private readonly groups = new Map<string, AudioGroup>()

  constructor(options: GameAudioControllerOptions = {}) {
    this.createAudio = options.createAudio ?? (() => Audio.create({ autoStart: false }))
  }

  getStatus() {
    return this.status
  }

  async sync(surface: AudioSurface, settings: UserSettings) {
    const nextTrack = musicTrackForSurface(surface)
    if (this.loading) await this.loading
    this.loading = this.syncNow(nextTrack, settings).finally(() => {
      this.loading = null
    })
    await this.loading
    return this.status
  }

  dispose() {
    this.stopCurrentVoice()
    this.audio?.dispose()
    this.audio = null
    this.groups.clear()
    this.sounds.clear()
    this.eventSounds.clear()
    this.currentTrack = null
    this.status = "Audio disposed."
  }

  async playEvent(eventId: AudioEventId, settings: UserSettings) {
    if (settings.muteAudio || !settings.sound) return null
    if (this.loading) await this.loading
    const audio = this.ensureAudio()
    if (!audio) return null
    this.applyVolumes(settings)
    if (!audio.isStarted() && !audio.start()) return null
    const sound = this.loadEvent(eventId)
    const event = audioEvent(eventId)
    if (sound == null || event == null) return null
    return audio.play(sound, {
      loop: false,
      volume: event.defaultVolume,
      groupId: this.group(event.group) ?? undefined,
    })
  }

  private async syncNow(nextTrack: AudioTrackId, settings: UserSettings) {
    if (settings.muteAudio || !settings.music) {
      if (this.audio) {
        this.applyVolumes(settings)
        this.stopCurrentVoice()
      }
      this.status = settings.muteAudio ? "Audio muted. Press Ctrl+O to unmute." : "Music off."
      return
    }

    const audio = this.ensureAudio()
    if (!audio) return

    this.applyVolumes(settings)
    if (this.currentTrack === nextTrack && this.currentVoice != null) {
      this.status = audioStatusText(nextTrack, settings)
      return
    }

    if (!audio.isStarted() && !audio.start()) {
      this.stopCurrentVoice()
      this.status = "Audio unavailable: no output device."
      return
    }

    const sound = await this.loadTrack(nextTrack)
    if (sound == null) {
      this.stopCurrentVoice()
      this.status = `Audio unavailable: missing ${nextTrack} track.`
      return
    }

    this.stopCurrentVoice()
    const group = this.group("music")
    const track = audioTrack(nextTrack)
    const voice = audio.play(sound, {
      loop: track?.loop ?? true,
      volume: track?.defaultVolume ?? 0.75,
      groupId: group ?? undefined,
    })
    if (voice == null) {
      this.status = `Audio unavailable: could not play ${nextTrack}.`
      return
    }

    this.currentVoice = voice
    this.currentTrack = nextTrack
    this.status = audioStatusText(nextTrack, settings)
  }

  private ensureAudio() {
    if (this.audio) return this.audio
    try {
      this.audio = this.createAudio()
      this.audio.on("error", (error) => {
        this.status = `Audio unavailable: ${error.message}`
      })
      for (const group of audioManifest.groups) this.group(group)
      return this.audio
    } catch (error) {
      this.status = `Audio unavailable: ${error instanceof Error ? error.message : "native engine failed"}`
      return null
    }
  }

  private async loadTrack(trackId: AudioTrackId) {
    const cached = this.sounds.get(trackId)
    if (cached != null) return cached
    const audio = this.ensureAudio()
    if (!audio) return null
    const sound = await this.loadTrackFromEmbeddedBytes(trackId, audio)
    if (sound != null) this.sounds.set(trackId, sound)
    return sound
  }

  private async loadTrackFromEmbeddedBytes(trackId: AudioTrackId, audio: AudioLike) {
    const embeddedPath = embeddedTrackFiles[trackId]
    try {
      const sound = audio.loadSound(await Bun.file(embeddedPath).bytes())
      if (sound != null) return sound
    } catch {
      // Fall back to the source file during development or unusual packaged layouts.
    }
    return audio.loadSoundFile(audioTrackRuntimePath(trackId))
  }

  private loadEvent(eventId: AudioEventId) {
    const cached = this.eventSounds.get(eventId)
    if (cached != null) return cached
    const audio = this.ensureAudio()
    const event = audioEvent(eventId)
    if (!audio || !event) return null
    const sound = audio.loadSound(synthesizeSfx(event.synth))
    if (sound != null) this.eventSounds.set(eventId, sound)
    return sound
  }

  private group(name: string) {
    const cached = this.groups.get(name)
    if (cached != null) return cached
    const group = this.audio?.group(name) ?? null
    if (group != null) this.groups.set(name, group)
    return group
  }

  private applyVolumes(settings: UserSettings) {
    const audio = this.audio
    if (!audio) return
    audio.setMasterVolume(effectiveMasterVolume(settings))
    const groups = effectiveGroupVolumes(settings)
    for (const [name, volume] of Object.entries(groups)) {
      const group = this.group(name)
      if (group != null) audio.setGroupVolume(group, volume)
    }
  }

  private stopCurrentVoice() {
    if (this.currentVoice != null) this.audio?.stopVoice(this.currentVoice)
    this.currentVoice = null
    this.currentTrack = null
  }
}

const embeddedTrackFiles: Record<AudioTrackId, string> = {
  "title-settings": titleSettingsLoopFile,
  dungeon: dungeonLoopFile,
}

function audioStatusText(trackId: AudioTrackId, settings: UserSettings) {
  const track = audioTrack(trackId)
  const master = formatVolume(settings.masterVolume)
  const music = formatVolume(settings.musicVolume)
  return `${track?.title ?? trackId} playing. Master ${master}. Music ${music}. Ctrl+O mute.`
}

export function formatVolume(value: number) {
  return `${Math.round(clampVolume(value) * 100)}%`
}

function clampVolume(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
}
