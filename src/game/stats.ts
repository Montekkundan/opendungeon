import type { HeroClass } from "./session.js"

const statIds = ["vigor", "mind", "endurance", "strength", "dexterity", "intelligence", "faith", "luck"] as const

export type StatId = (typeof statIds)[number]
export type HeroStats = Record<StatId, number>

export const statLabels: Record<StatId, string> = {
  vigor: "Vigor",
  mind: "Mind",
  endurance: "Endurance",
  strength: "Strength",
  dexterity: "Dexterity",
  intelligence: "Intelligence",
  faith: "Faith",
  luck: "Luck",
}

export const statAbbreviations: Record<StatId, string> = {
  vigor: "VIG",
  mind: "MND",
  endurance: "END",
  strength: "STR",
  dexterity: "DEX",
  intelligence: "INT",
  faith: "FTH",
  luck: "LCK",
}

const classStats: Record<HeroClass, HeroStats> = {
  warden: {
    vigor: 16,
    mind: 8,
    endurance: 15,
    strength: 14,
    dexterity: 8,
    intelligence: 6,
    faith: 10,
    luck: 7,
  },
  arcanist: {
    vigor: 8,
    mind: 16,
    endurance: 8,
    strength: 6,
    dexterity: 10,
    intelligence: 16,
    faith: 12,
    luck: 8,
  },
  ranger: {
    vigor: 11,
    mind: 10,
    endurance: 12,
    strength: 10,
    dexterity: 15,
    intelligence: 9,
    faith: 8,
    luck: 12,
  },
}

const levelGrowth: Record<HeroClass, StatId[]> = {
  warden: ["vigor", "endurance", "strength", "faith"],
  arcanist: ["mind", "intelligence", "faith", "luck"],
  ranger: ["dexterity", "luck", "endurance", "strength"],
}

export function statsForClass(classId: HeroClass): HeroStats {
  return { ...classStats[classId] }
}

export function normalizeStats(classId: HeroClass, stats?: Partial<Record<StatId, number>> | null): HeroStats {
  const base = statsForClass(classId)
  for (const stat of statIds) {
    const value = stats?.[stat]
    if (typeof value === "number" && Number.isFinite(value)) base[stat] = Math.max(1, Math.floor(value))
  }
  return base
}

export function derivedMaxHp(stats: HeroStats) {
  return 8 + stats.vigor + Math.floor(stats.endurance / 2)
}

export function derivedMaxFocus(stats: HeroStats) {
  return 3 + Math.floor(stats.mind / 2) + Math.floor(stats.intelligence / 3)
}

export function statModifier(value: number) {
  return Math.floor((value - 10) / 2)
}

export function formatModifier(value: number) {
  return value >= 0 ? `+${value}` : String(value)
}

export function statLine(stats: HeroStats) {
  return `VIG ${stats.vigor}  END ${stats.endurance}  STR ${stats.strength}  DEX ${stats.dexterity}  INT ${stats.intelligence}  FTH ${stats.faith}  LCK ${stats.luck}`
}

export function applyLevelGrowth(classId: HeroClass, stats: HeroStats, level: number) {
  const growth = levelGrowth[classId]
  const primary = growth[(level - 2) % growth.length]
  const secondary = growth[(level - 1) % growth.length]
  stats[primary] += 1
  if (level % 2 === 0) stats[secondary] += 1
}
