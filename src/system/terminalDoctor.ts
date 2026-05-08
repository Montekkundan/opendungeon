import type { UserSettings } from "../game/settingsStore.js"

export type TerminalCapabilityReport = {
  columns: number
  rows: number
  term: string
  termProgram: string
  colorTerm: string
  recommendedTileScale: UserSettings["tileScale"]
  warnings: string[]
}

export function terminalCapabilityReport(env: NodeJS.ProcessEnv = process.env, columns = process.stdout.columns ?? 80, rows = process.stdout.rows ?? 24): TerminalCapabilityReport {
  const report: TerminalCapabilityReport = {
    columns,
    rows,
    term: env.TERM || "unknown",
    termProgram: env.TERM_PROGRAM || "unknown",
    colorTerm: env.COLORTERM || "",
    recommendedTileScale: recommendedTileScale(columns, rows),
    warnings: [],
  }

  if (columns < 96) report.warnings.push("Terminal width below 96 columns; compact HUD will be used.")
  if (rows < 30) report.warnings.push("Terminal height below 30 rows; use overview or wide tile scale.")
  if (!/truecolor|24bit/i.test(report.colorTerm) && !/kitty|wezterm|vscode|iTerm/i.test(report.termProgram)) report.warnings.push("Truecolor support was not detected from COLORTERM or TERM_PROGRAM.")
  return report
}

export function recommendedTileScale(columns: number, rows: number): UserSettings["tileScale"] {
  if (columns >= 132 && rows >= 38) return "wide"
  if (columns >= 104 && rows >= 32) return "medium"
  if (columns >= 86 && rows >= 28) return "overview"
  return "overview"
}

export function formatTerminalCapabilityReport(report: TerminalCapabilityReport) {
  const warnings = report.warnings.length ? report.warnings.map((warning) => `- ${warning}`).join("\n") : "- None"
  return [
    "opendungeon terminal check",
    `size: ${report.columns}x${report.rows}`,
    `term: ${report.term}`,
    `program: ${report.termProgram}`,
    `color: ${report.colorTerm || "unknown"}`,
    `recommended tile scale: ${report.recommendedTileScale}`,
    "warnings:",
    warnings,
  ].join("\n")
}
