import { describe, expect, test } from "bun:test"
import { HostCommandRelay } from "./hostCommandRelay.js"

describe("host command relay", () => {
  test("applies movement commands to a host-owned session", () => {
    const relay = new HostCommandRelay({ mode: "coop", seed: 2423368 })

    const result = relay.apply({
      label: "Moved east",
      name: "Mira",
      payload: { direction: "east" },
      playerId: "mira",
      type: "move",
    })

    expect(result).toMatchObject({ accepted: true, floor: 1, status: "running" })
    expect(result.message).toBeTruthy()
  })

  test("rejects malformed movement without mutating host state", () => {
    const relay = new HostCommandRelay({ mode: "coop", seed: 2423368 })
    const before = relay.apply({
      label: "Moved east",
      name: "Mira",
      payload: { direction: "east" },
      playerId: "mira",
      type: "move",
    })

    const rejected = relay.apply({
      label: "Moved somewhere",
      name: "Mira",
      payload: {},
      playerId: "mira",
      type: "move",
    })

    expect(rejected.accepted).toBe(false)
    expect(rejected.message).toContain("direction")
    expect(rejected).toMatchObject({
      floor: before.floor,
      hp: before.hp,
      turn: before.turn,
      x: before.x,
      y: before.y,
    })
  })

  test("keeps player command streams on separate host sessions", () => {
    const relay = new HostCommandRelay({ mode: "coop", seed: 2423368 })
    const payload = { classId: "ranger", direction: "east", tutorialEnabled: true, tutorialStage: "movement" }
    const miraFirst = relay.apply(command({ label: "Moved east", payload, playerId: "mira" }))
    const miraSecond = relay.apply(command({ label: "Moved east", payload, playerId: "mira" }))
    const solFirst = relay.apply(command({ label: "Moved east", name: "Sol", payload, playerId: "sol" }))

    expect(miraFirst.accepted).toBe(true)
    expect(miraSecond.x).toBeGreaterThan(miraFirst.x)
    expect(solFirst).toMatchObject({ x: miraFirst.x, y: miraFirst.y })
  })

  test("mirrors tutorial journal actions so the host opens the first co-op gate", () => {
    const relay = new HostCommandRelay({ mode: "coop", seed: 2423368 })
    const payload = { classId: "ranger", tutorialEnabled: true, tutorialStage: "movement" }

    for (const direction of ["up", "down", "left", "right"]) {
      relay.apply(command({ label: `Moved ${direction}`, payload: { ...payload, direction } }))
    }
    relay.apply(command({ label: "Opened inventory", payload, type: "inventory" }))
    relay.apply(command({ label: "Opened Book", payload, type: "interact" }))
    const result = relay.apply(command({ label: "Opened quest journal", payload, type: "interact" }))

    expect(result.accepted).toBe(true)
    expect(result.message).toContain("Area I gate opens")
  })
})

function command(overrides: Partial<Parameters<HostCommandRelay["apply"]>[0]> = {}): Parameters<HostCommandRelay["apply"]>[0] {
  return {
    label: "Moved east",
    name: "Mira",
    payload: {},
    playerId: "mira",
    type: "move",
    ...overrides,
  }
}
