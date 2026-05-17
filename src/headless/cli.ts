import { resolve } from "node:path"
import { runBalanceSuite } from "./balance.js"
import { builtinScenario, loadScenarioFile, runScenario } from "./scenario.js"
import { runHeadlessProtocol } from "./protocol.js"
import { type HeadlessEnvOptions } from "./env.js"
import { isHeroClass } from "../game/session.js"

const args = process.argv.slice(2)

if (args.includes("--help") || args.includes("-h")) {
  console.log(`opendungeon headless

Usage:
  bun run headless -- --scenario smoke
  bun run headless -- --scenario combat --seed 1234 --assert
  bun run headless -- --script tests/scenarios/save-load.jsonl --assert
  bun run headless -- --balance-suite
  bun run headless -- --protocol

Options:
  --scenario <name>      Built-in scenario: smoke, new-player-journey, combat, combat-skills, area-combat, boss-phase, status-effects, reaction-block, character-name, starting-loadout, biome, trap, secret-door, floor-modifier, skill-check, note-collectible, collectible-variety, first-clear-loop, save-load, save-management, auth-local, auth-expired, map-generation, npc-event, npc-conversation, merchant, level-up-talent, dialogue-options, full-run
  --script <path>        JSONL scenario file
  --seed <number>        Deterministic seed
  --mode <mode>          solo | coop | race. solo is Single Player, coop is Multiplayer, race is a challenge variant.
  --class <class>        warden | arcanist | ranger | duelist | cleric | engineer | witch | grave-knight
  --hero-name <name>     Crawler name for reset/protocol sessions
  --max-steps <number>   Episode truncation limit
  --assert              Exit non-zero when scenario assertions fail
  --balance-suite       Run multi-seed/class balance metrics for tuning
  --protocol            Start JSONL/stdin protocol for Python or other clients
`)
  process.exit(0)
}

if (args.includes("--balance-suite")) {
  console.log(JSON.stringify({ type: "balance", report: runBalanceSuite() }, null, 2))
  process.exit(0)
}

if (args.includes("--protocol")) {
  await runHeadlessProtocol(envOptionsFromArgs())
  process.exit(0)
}

const scenarioName = valueAfter("--scenario") ?? "smoke"
const scriptPath = valueAfter("--script")
const scenario = scriptPath ? loadScenarioFile(resolve(scriptPath)) : builtinScenario(scenarioName)

if (!scenario) {
  console.error(`Unknown headless scenario: ${scenarioName}`)
  process.exit(2)
}

const result = runScenario(scriptPath ?? scenarioName, scenario, envOptionsFromArgs())
for (const event of result.events) console.log(JSON.stringify(compactEvent(event)))
console.log(JSON.stringify({ type: "summary", name: result.name, seed: result.seed, ok: result.ok, failures: result.failures, finalSnapshot: result.finalSnapshot }))

if (args.includes("--assert") && !result.ok) process.exit(1)

function envOptionsFromArgs(): HeadlessEnvOptions {
  const seed = Number(valueAfter("--seed"))
  const maxSteps = Number(valueAfter("--max-steps"))
  const mode = valueAfter("--mode")
  const classId = valueAfter("--class")
  const heroName = valueAfter("--hero-name")
  return {
    seed: Number.isFinite(seed) ? Math.floor(seed) : undefined,
    maxSteps: Number.isFinite(maxSteps) ? Math.floor(maxSteps) : undefined,
    mode: mode === "solo" || mode === "coop" || mode === "race" ? mode : undefined,
    classId: isHeroClass(classId) ? classId : undefined,
    heroName,
  }
}

function valueAfter(flag: string) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

function compactEvent(event: unknown) {
  const record = event as Record<string, unknown>
  const result = record.result as Record<string, unknown> | undefined
  const info = result?.info as Record<string, unknown> | undefined
  return {
    index: record.index,
    type: record.type,
    command: record.command,
    errors: record.errors,
    action: info?.action,
    valid: info?.valid,
    reward: result?.reward,
    terminated: result?.terminated,
    truncated: result?.truncated,
    message: info?.message,
    snapshot: info?.snapshot ?? (record.observation as Record<string, unknown> | undefined)?.snapshot,
  }
}
