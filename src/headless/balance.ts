import { heroClassIds, type HeroClass } from "../game/session.js"
import { HeadlessGameEnv, type HeadlessActionId } from "./env.js"

export type BalanceRun = {
  seed: number
  classId: HeroClass
  status: string
  floor: number
  turn: number
  level: number
  kills: number
  gold: number
  hp: number
}

export type BalanceReport = {
  runCount: number
  deathRate: number
  victoryRate: number
  averageFloor: number
  averageLevel: number
  averageTurns: number
  commonStops: Record<string, number>
  runs: BalanceRun[]
}

export type BalanceOptions = {
  seeds?: number[]
  classes?: HeroClass[]
  maxSteps?: number
}

export function runBalanceSuite(options: BalanceOptions = {}): BalanceReport {
  const seeds = options.seeds ?? [101, 202, 303, 404, 505, 606, 707, 808]
  const classes = options.classes ?? [...heroClassIds]
  const maxSteps = options.maxSteps ?? 220
  const runs: BalanceRun[] = []

  for (const seed of seeds) {
    for (const classId of classes) {
      const env = new HeadlessGameEnv({ seed, classId, maxSteps, isolateStorage: true })
      try {
        for (let step = 0; step < maxSteps; step++) {
          const action = choosePolicyAction(env.legalActions())
          const result = env.step(action)
          if (result.terminated || result.truncated) break
        }
        const snapshot = env.snapshot()
        runs.push({
          seed,
          classId,
          status: snapshot.status,
          floor: snapshot.floor,
          turn: snapshot.turn,
          level: snapshot.level,
          kills: snapshot.kills,
          gold: snapshot.gold,
          hp: snapshot.hp,
        })
      } finally {
        env.close()
      }
    }
  }

  return summarizeBalanceRuns(runs)
}

function choosePolicyAction(legal: HeadlessActionId[]): HeadlessActionId {
  for (const action of [
    "choose-levelup-0",
    "choose-dialogue-0",
    "resolve-skill-check",
    "dismiss-skill-check",
    "combat-roll",
    "select-skill-2",
    "select-skill-0",
    "use-potion",
    "move-east",
    "move-south",
    "move-north",
    "move-west",
    "interact",
    "rest",
    "noop",
  ] as const) {
    if (legal.includes(action)) return action
  }
  return legal[0] ?? "noop"
}

function summarizeBalanceRuns(runs: BalanceRun[]): BalanceReport {
  const runCount = runs.length
  const commonStops: Record<string, number> = {}
  for (const run of runs) commonStops[run.status] = (commonStops[run.status] ?? 0) + 1
  return {
    runCount,
    deathRate: ratio(runs.filter((run) => run.status === "dead").length, runCount),
    victoryRate: ratio(runs.filter((run) => run.status === "victory").length, runCount),
    averageFloor: average(runs.map((run) => run.floor)),
    averageLevel: average(runs.map((run) => run.level)),
    averageTurns: average(runs.map((run) => run.turn)),
    commonStops,
    runs,
  }
}

function average(values: number[]) {
  if (!values.length) return 0
  return Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(2))
}

function ratio(value: number, total: number) {
  if (!total) return 0
  return Number((value / total).toFixed(3))
}
