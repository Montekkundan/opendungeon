export const villageSeedModes = ["fresh", "chosen", "challenge"] as const
export type VillageSeedMode = (typeof villageSeedModes)[number]

export function nextVillageSeedMode(mode: VillageSeedMode): VillageSeedMode {
  if (mode === "fresh") return "chosen"
  if (mode === "chosen") return "challenge"
  return "fresh"
}

export function villageSeedModeLabel(mode: VillageSeedMode) {
  if (mode === "chosen") return "Current seed"
  if (mode === "challenge") return "Daily challenge"
  return "Fresh random"
}

export function villageSeedPlanText(mode: VillageSeedMode, currentSeed: number, now = new Date()) {
  if (mode === "chosen") return `current/player seed ${currentSeed}`
  if (mode === "challenge") return `daily challenge seed ${dailyChallengeSeed(now)}`
  return "fresh random seed"
}

export function seedForVillageDescent(mode: VillageSeedMode, currentSeed: number, randomSeed: () => number, now = new Date()) {
  if (mode === "chosen") return currentSeed
  if (mode === "challenge") return dailyChallengeSeed(now)
  return randomSeed()
}

export function dailyChallengeSeed(now = new Date()) {
  const dayKey = now.getFullYear() * 10_000 + (now.getMonth() + 1) * 100 + now.getDate()
  return 1_000_000 + (dayKey % 9_000_000)
}
