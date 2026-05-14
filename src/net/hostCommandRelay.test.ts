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
})
