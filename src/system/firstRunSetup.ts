import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { generatedAssetDirectory } from "../cloud/aiGateway.js"
import { authDirectory } from "../cloud/authStore.js"
import { saveDirectory } from "../game/saveStore.js"
import { loadSettings, profileDirectory } from "../game/settingsStore.js"
import { formatServerSetupReport, serverSetupReport } from "./serverSetupCheck.js"
import { formatTerminalCapabilityReport, terminalCapabilityReport } from "./terminalDoctor.js"

export type FirstRunSetupReport = {
  dryRun: boolean
  directories: string[]
  profileReady: boolean
  serverReady: boolean
  messages: string[]
}

export async function handleSetupCommand(args: string[]): Promise<number | null> {
  if (args[0] !== "setup") return null
  const dryRun = args.includes("--dry-run")
  const report = firstRunSetup({ dryRun })
  console.log(formatFirstRunSetupReport(report))
  console.log("")
  console.log(formatTerminalCapabilityReport(terminalCapabilityReport()))
  console.log("")
  console.log(formatServerSetupReport(serverSetupReport()))
  return report.profileReady ? 0 : 1
}

export function firstRunSetup(options: { dryRun?: boolean } = {}): FirstRunSetupReport {
  const directories = setupDirectories()
  if (!options.dryRun) {
    for (const directory of directories) mkdirSync(directory, { recursive: true })
    loadSettings()
  }

  return {
    dryRun: Boolean(options.dryRun),
    directories,
    profileReady: true,
    serverReady: serverSetupReport().ready,
    messages: [
      options.dryRun ? "Dry run only; no directories were created." : "Local profile, save, auth, world, and generated asset directories are ready.",
      "Run opendungeon setup-check to review Supabase, AI Gateway, and storage configuration.",
    ],
  }
}

export function formatFirstRunSetupReport(report: FirstRunSetupReport) {
  return [
    "opendungeon first-run setup",
    `mode: ${report.dryRun ? "dry-run" : "write"}`,
    "directories:",
    ...report.directories.map((directory) => `- ${directory}`),
    ...report.messages,
  ].join("\n")
}

function setupDirectories() {
  return [
    profileDirectory(),
    saveDirectory(),
    authDirectory(),
    process.env.OPENDUNGEON_WORLD_DIR || join(homedir(), ".opendungeon", "worlds"),
    generatedAssetDirectory(),
  ]
}
