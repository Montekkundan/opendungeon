import { describe, expect, test } from "bun:test"
import { challengeCadenceForVillageSeedMode, dailyChallengeSeed, nextVillageSeedMode, seedForVillageDescent, villageSeedPlanText, weeklyChallengeSeed } from "./descentSeed.js"

describe("village descent seed plans", () => {
  test("cycles through fresh, current seed, and daily challenge plans", () => {
    expect(nextVillageSeedMode("fresh")).toBe("chosen")
    expect(nextVillageSeedMode("chosen")).toBe("challenge")
    expect(nextVillageSeedMode("challenge")).toBe("weekly")
    expect(nextVillageSeedMode("weekly")).toBe("fresh")
  })

  test("chooses seeds from the selected village plan", () => {
    const day = new Date("2026-05-13T12:00:00Z")
    const random = () => 7_777_777

    expect(seedForVillageDescent("fresh", 2_423_368, random, day)).toBe(7_777_777)
    expect(seedForVillageDescent("chosen", 2_423_368, random, day)).toBe(2_423_368)
    expect(seedForVillageDescent("challenge", 2_423_368, random, day)).toBe(dailyChallengeSeed(day))
    expect(seedForVillageDescent("weekly", 2_423_368, random, day)).toBe(weeklyChallengeSeed(day))
    expect(villageSeedPlanText("challenge", 2_423_368, day)).toContain(String(dailyChallengeSeed(day)))
    expect(villageSeedPlanText("weekly", 2_423_368, day)).toContain(String(weeklyChallengeSeed(day)))
    expect(challengeCadenceForVillageSeedMode("challenge")).toBe("daily")
    expect(challengeCadenceForVillageSeedMode("weekly")).toBe("weekly")
    expect(challengeCadenceForVillageSeedMode("fresh")).toBeNull()
  })
})
