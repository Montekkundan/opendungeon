import { createInterface } from "node:readline"
import {
  agentObservationSize,
  HeadlessGameEnv,
  headlessActionIds,
  type HeadlessActionInput,
  type HeadlessEnvOptions,
  type ObservationMode,
} from "./env.js"

type ProtocolRequest = {
  id?: string | number
  command?: "spec" | "reset" | "step" | "observe" | "legal-actions" | "render" | "snapshot" | "invariants" | "close"
  seed?: number
  mode?: HeadlessEnvOptions["mode"]
  classId?: HeadlessEnvOptions["classId"]
  maxSteps?: number
  observationMode?: ObservationMode
  action?: HeadlessActionInput
}

export async function runHeadlessProtocol(options: HeadlessEnvOptions = {}) {
  const env = new HeadlessGameEnv({ observationMode: "agent", isolateStorage: true, ...options })
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

  try {
    for await (const line of rl) {
      const text = line.trim()
      if (!text) continue

      let request: ProtocolRequest
      try {
        request = JSON.parse(text) as ProtocolRequest
      } catch (error) {
        writeResponse(undefined, false, undefined, error instanceof Error ? error.message : "Invalid JSON.")
        continue
      }

      try {
        const result = handleProtocolRequest(env, request)
        writeResponse(request.id, true, result)
        if (request.command === "close") break
      } catch (error) {
        writeResponse(request.id, false, undefined, error instanceof Error ? error.message : "Headless protocol command failed.")
      }
    }
  } finally {
    env.close()
  }
}

export function handleProtocolRequest(env: HeadlessGameEnv, request: ProtocolRequest) {
  const command = request.command ?? "step"
  if (command === "spec") {
    return {
      actionIds: [...headlessActionIds],
      actionCount: headlessActionIds.length,
      agentObservationSize,
      observationMode: env.observationMode,
    }
  }
  if (command === "reset") {
    return env.reset({
      seed: request.seed,
      mode: request.mode,
      classId: request.classId,
      maxSteps: request.maxSteps,
      observationMode: request.observationMode,
    })
  }
  if (command === "step") return env.step(request.action ?? "noop")
  if (command === "observe") return env.observe(request.observationMode ?? env.observationMode)
  if (command === "legal-actions") return { legalActions: env.legalActions(), actionMask: env.actionMask() }
  if (command === "render") return { text: env.renderText() }
  if (command === "snapshot") return env.snapshot()
  if (command === "invariants") return { errors: env.validateInvariants() }
  if (command === "close") return { closed: true }
  throw new Error(`Unknown protocol command: ${command}`)
}

function writeResponse(id: ProtocolRequest["id"], ok: boolean, result?: unknown, error?: string) {
  process.stdout.write(`${JSON.stringify({ id, ok, result, error })}\n`)
}

if (import.meta.main) {
  await runHeadlessProtocol()
}
