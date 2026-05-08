import { describe, expect, test } from "bun:test"
import { formatTerminalCapabilityReport, recommendedTileScale, terminalCapabilityReport } from "./terminalDoctor.js"

describe("terminal doctor", () => {
  test("recommends a tile scale from terminal size", () => {
    expect(recommendedTileScale(140, 40)).toBe("wide")
    expect(recommendedTileScale(110, 34)).toBe("medium")
    expect(recommendedTileScale(80, 24)).toBe("overview")
  })

  test("reports warnings for small or non-truecolor terminals", () => {
    const report = terminalCapabilityReport({ TERM: "xterm", TERM_PROGRAM: "Apple_Terminal", COLORTERM: "" }, 80, 24)

    expect(report.recommendedTileScale).toBe("overview")
    expect(report.warnings).toContain("Terminal width below 96 columns; compact HUD will be used.")
    expect(report.warnings).toContain("Terminal height below 30 rows; use overview or wide tile scale.")
    expect(formatTerminalCapabilityReport(report)).toContain("recommended tile scale: overview")
  })
})
