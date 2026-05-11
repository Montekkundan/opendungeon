import { describe, expect, test } from "bun:test"
import { runBalanceSuite } from "./balance.js"

describe("headless balance suite", () => {
  test("summarizes multi-seed class runs for tuning", () => {
    const report = runBalanceSuite({
      seeds: [111, 222],
      classes: ["ranger", "warden"],
      maxSteps: 30,
    })

    expect(report.runCount).toBe(4)
    expect(report.runs).toHaveLength(4)
    expect(report.averageFloor).toBeGreaterThanOrEqual(1)
    expect(report.averageLevel).toBeGreaterThanOrEqual(1)
    expect(report.deathRate).toBeGreaterThanOrEqual(0)
    expect(report.victoryRate).toBeGreaterThanOrEqual(0)
    expect(Object.values(report.commonStops).reduce((total, count) => total + count, 0)).toBe(4)
  })
})
