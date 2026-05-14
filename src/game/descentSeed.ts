export const villageSeedModes = ["fresh", "chosen", "challenge", "weekly"] as const
export type VillageSeedMode = (typeof villageSeedModes)[number]
export type ChallengeCadence = "daily" | "weekly"

export function nextVillageSeedMode(mode: VillageSeedMode): VillageSeedMode {
  if (mode === "fresh") return "chosen"
  if (mode === "chosen") return "challenge"
  if (mode === "challenge") return "weekly"
  return "fresh"
}

export function villageSeedModeLabel(mode: VillageSeedMode) {
  if (mode === "chosen") return "Current seed"
  if (mode === "challenge") return "Daily challenge"
  if (mode === "weekly") return "Weekly challenge"
  return "Fresh random"
}

export function villageSeedPlanText(mode: VillageSeedMode, currentSeed: number, now = new Date()) {
  if (mode === "chosen") return `current/player seed ${currentSeed}`
  if (mode === "challenge") return `daily challenge seed ${dailyChallengeSeed(now)}`
  if (mode === "weekly") return `weekly challenge seed ${weeklyChallengeSeed(now)}`
  return "fresh random seed"
}

export function seedForVillageDescent(mode: VillageSeedMode, currentSeed: number, randomSeed: () => number, now = new Date()) {
  if (mode === "chosen") return currentSeed
  if (mode === "challenge") return dailyChallengeSeed(now)
  if (mode === "weekly") return weeklyChallengeSeed(now)
  return randomSeed()
}

export function challengeCadenceForVillageSeedMode(mode: VillageSeedMode): ChallengeCadence | null {
  if (mode === "challenge") return "daily"
  if (mode === "weekly") return "weekly"
  return null
}

export function challengeSeed(cadence: ChallengeCadence, now = new Date()) {
  return cadence === "weekly" ? weeklyChallengeSeed(now) : dailyChallengeSeed(now)
}

export function dailyChallengeSeed(now = new Date()) {
  const dayKey = now.getFullYear() * 10_000 + (now.getMonth() + 1) * 100 + now.getDate()
  return 1_000_000 + (dayKey % 9_000_000)
}

export function weeklyChallengeSeed(now = new Date()) {
  const start = Date.UTC(now.getFullYear(), 0, 1)
  const current = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const week = Math.floor((current - start) / (7 * 24 * 60 * 60 * 1000)) + 1
  const weekKey = now.getFullYear() * 100 + week
  return 2_000_000 + (weekKey % 8_000_000)
}
