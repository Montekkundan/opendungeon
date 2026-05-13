import { existsSync } from "node:fs"
import { assetPath } from "../assets/spriteSampler.js"
import type { SynthProfile } from "./sfxSynth.js"

export type AudioTrackId = "title-settings" | "dungeon"
export type AudioGroupId = "music" | "sfx" | "ui"

export type AudioTrackManifestEntry = {
  id: AudioTrackId
  title: string
  group: AudioGroupId
  file: string
  loop: boolean
  defaultVolume: number
  use: string
  licenseId: "project-owned" | "CC0-1.0" | "CC-BY-3.0" | "CC-BY-4.0" | "MIT"
  source: string
  canonical: boolean
}

export type AudioEventId =
  | "teleport-start"
  | "teleport-end"
  | "gate-open"
  | "d20-roll"
  | "d20-success"
  | "d20-fail"
  | "combat-hit"
  | "combat-block"
  | "combat-crit"
  | "item-pickup"
  | "quest-update"
  | "book-update"
  | "village-build"
  | "menu-confirm"
  | "menu-cancel"

export type AudioEventManifestEntry = {
  id: AudioEventId
  title: string
  group: Extract<AudioGroupId, "sfx" | "ui">
  defaultVolume: number
  use: string
  licenseId: "project-owned"
  source: string
  synth: SynthProfile
}

export const audioManifest = {
  version: 1,
  groups: ["music", "sfx", "ui"],
  tracks: [
    {
      id: "title-settings",
      title: "Quest Preparation",
      group: "music",
      file: "title-settings-loop.mp3",
      loop: true,
      defaultVolume: 0.7,
      use: "Title, settings, menus, tutorial, village, and non-dungeon screens.",
      licenseId: "project-owned",
      source: "assets/opendungeon-assets/licenses/project-owned-audio.txt",
      canonical: true,
    },
    {
      id: "dungeon",
      title: "Beneath the Blackened Stone",
      group: "music",
      file: "dungeon-loop.mp3",
      loop: true,
      defaultVolume: 0.75,
      use: "Dungeon gameplay, combat, talent checks, inventory, Book, map, and run overlays.",
      licenseId: "project-owned",
      source: "assets/opendungeon-assets/licenses/project-owned-audio.txt",
      canonical: true,
    },
  ],
  events: [
    sfx("teleport-start", "Teleport start", "sfx", "Portal and descent transition begins.", { wave: "sine", steps: [{ frequency: 220, slideTo: 660, durationMs: 220, volume: 0.42 }, { frequency: 880, slideTo: 440, durationMs: 120, volume: 0.28 }] }),
    sfx("teleport-end", "Teleport land", "sfx", "Portal and descent transition lands.", { wave: "triangle", steps: [{ frequency: 720, slideTo: 180, durationMs: 260, volume: 0.45 }] }),
    sfx("gate-open", "Gate open", "sfx", "Doors, tutorial gates, and dungeon gates opening.", { wave: "square", steps: [{ frequency: 96, slideTo: 56, durationMs: 160, volume: 0.32 }, { frequency: 130, slideTo: 88, durationMs: 150, volume: 0.24 }] }),
    sfx("d20-roll", "d20 roll", "sfx", "Dice roll begins for combat and talent checks.", { wave: "noise", attackMs: 2, releaseMs: 45, steps: [{ frequency: 1, durationMs: 180, volume: 0.18 }] }),
    sfx("d20-success", "d20 success", "sfx", "Talent check, flee, or attack roll succeeds.", { wave: "triangle", steps: [{ frequency: 520, durationMs: 80, volume: 0.34 }, { frequency: 780, durationMs: 120, volume: 0.36 }] }),
    sfx("d20-fail", "d20 fail", "sfx", "Talent check, flee, or attack roll fails.", { wave: "triangle", steps: [{ frequency: 240, durationMs: 90, volume: 0.32 }, { frequency: 150, durationMs: 160, volume: 0.3 }] }),
    sfx("combat-hit", "Combat hit", "sfx", "Normal attack damage lands.", { wave: "square", attackMs: 3, releaseMs: 35, steps: [{ frequency: 160, slideTo: 80, durationMs: 130, volume: 0.36 }] }),
    sfx("combat-block", "Combat block", "sfx", "Misses, resisted damage, and blocked combat outcomes.", { wave: "noise", attackMs: 1, releaseMs: 30, steps: [{ frequency: 1, durationMs: 80, volume: 0.12 }, { frequency: 1, durationMs: 70, volume: 0.08 }] }),
    sfx("combat-crit", "Critical hit", "sfx", "Critical combat hit.", { wave: "square", steps: [{ frequency: 220, durationMs: 80, volume: 0.35 }, { frequency: 330, durationMs: 80, volume: 0.38 }, { frequency: 660, durationMs: 130, volume: 0.34 }] }),
    sfx("item-pickup", "Item pickup", "sfx", "Inventory, loot, trade, and pickup feedback.", { wave: "sine", steps: [{ frequency: 420, durationMs: 75, volume: 0.28 }, { frequency: 640, durationMs: 90, volume: 0.25 }] }),
    sfx("quest-update", "Quest update", "ui", "Quest and objective updates.", { wave: "triangle", steps: [{ frequency: 330, durationMs: 75, volume: 0.26 }, { frequency: 495, durationMs: 100, volume: 0.24 }] }),
    sfx("book-update", "Book update", "ui", "Book, lore, and monstrary entry updates.", { wave: "sine", steps: [{ frequency: 300, durationMs: 70, volume: 0.24 }, { frequency: 360, durationMs: 70, volume: 0.2 }, { frequency: 450, durationMs: 110, volume: 0.2 }] }),
    sfx("village-build", "Village work", "sfx", "Village sell, build, cooking, and station actions.", { wave: "square", steps: [{ frequency: 180, durationMs: 70, volume: 0.24 }, { frequency: 240, durationMs: 100, volume: 0.22 }] }),
    sfx("menu-confirm", "Menu confirm", "ui", "Menu confirm and UI apply.", { wave: "sine", steps: [{ frequency: 520, durationMs: 80, volume: 0.18 }] }),
    sfx("menu-cancel", "Menu cancel", "ui", "Menu close and cancel.", { wave: "sine", steps: [{ frequency: 300, slideTo: 210, durationMs: 90, volume: 0.16 }] }),
  ],
} satisfies {
  version: 1
  groups: AudioGroupId[]
  tracks: AudioTrackManifestEntry[]
  events: AudioEventManifestEntry[]
}

export const plannedAudioEvents = audioManifest.events.map((event) => event.id)

export function audioTrack(id: AudioTrackId) {
  return audioManifest.tracks.find((track) => track.id === id) ?? null
}

export function audioEvent(id: AudioEventId) {
  return audioManifest.events.find((event) => event.id === id) ?? null
}

export function audioRuntimePath(file: string) {
  return assetPath("opendungeon-assets", "runtime", "audio", file)
}

export function audioTrackRuntimePath(id: AudioTrackId) {
  const track = audioTrack(id)
  return track ? audioRuntimePath(track.file) : ""
}

export function validateAudioManifest() {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const track of audioManifest.tracks) {
    if (ids.has(track.id)) errors.push(`${track.id} duplicates an audio track id.`)
    ids.add(track.id)
    if (!audioManifest.groups.includes(track.group)) errors.push(`${track.id} uses unknown group ${track.group}.`)
    if (!track.loop) errors.push(`${track.id} should loop for current music playback.`)
    if (track.defaultVolume < 0 || track.defaultVolume > 1) errors.push(`${track.id} has an invalid default volume.`)
    if (!existsSync(audioRuntimePath(track.file))) errors.push(`${track.id} missing runtime file ${track.file}.`)
    if (!existsSync(track.source)) errors.push(`${track.id} missing license/source note ${track.source}.`)
  }
  const eventIds = new Set<string>()
  for (const event of audioManifest.events) {
    if (eventIds.has(event.id)) errors.push(`${event.id} duplicates an audio event id.`)
    eventIds.add(event.id)
    if (!audioManifest.groups.includes(event.group)) errors.push(`${event.id} uses unknown group ${event.group}.`)
    if (event.defaultVolume < 0 || event.defaultVolume > 1) errors.push(`${event.id} has an invalid default volume.`)
    if (!existsSync(event.source)) errors.push(`${event.id} missing license/source note ${event.source}.`)
    if (event.synth.steps.length === 0) errors.push(`${event.id} has no synth steps.`)
  }
  return errors
}

function sfx(id: AudioEventId, title: string, group: "sfx" | "ui", use: string, synth: SynthProfile): AudioEventManifestEntry {
  return {
    id,
    title,
    group,
    defaultVolume: group === "ui" ? 0.7 : 0.85,
    use,
    licenseId: "project-owned",
    source: "assets/opendungeon-assets/licenses/project-owned-audio.txt",
    synth,
  }
}
