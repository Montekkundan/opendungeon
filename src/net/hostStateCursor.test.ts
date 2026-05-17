import { describe, expect, test } from "bun:test"
import type { HostAuthoritativeState } from "./lobbyState.js"
import { latestLocalHostState } from "./hostStateCursor.js"

function state(playerId: string, commandSequence: number, x: number): HostAuthoritativeState {
  return {
    accepted: true,
    combatActive: false,
    combatMessage: "",
    combatRound: 0,
    commandSequence,
    floor: 1,
    focus: 11,
    gold: 0,
    hp: 25,
    inventoryCount: 0,
    inventoryItems: [],
    level: 1,
    maxFocus: 11,
    maxHp: 25,
    message: `state ${commandSequence}`,
    name: playerId,
    playerId,
    status: "running",
    turn: commandSequence,
    updatedAt: commandSequence * 10,
    x,
    xp: 0,
    y: 7,
  }
}

describe("latestLocalHostState", () => {
  test("selects the newest authoritative state for the local player", () => {
    const snapshot = {
      hostStates: [state("p1", 2, 10), state("p2", 5, 99), state("p1", 4, 12)],
    }

    expect(latestLocalHostState(snapshot, "p1", 1)).toMatchObject({
      commandSequence: 4,
      playerId: "p1",
      x: 12,
    })
  })

  test("falls back to the singleton hostState when command history is trimmed", () => {
    const snapshot = {
      hostState: state("p1", 8, 14),
      hostStates: [state("p2", 9, 20)],
    }

    expect(latestLocalHostState(snapshot, "p1", 7)).toMatchObject({
      commandSequence: 8,
      playerId: "p1",
      x: 14,
    })
  })

  test("ignores already applied or remote states", () => {
    const snapshot = {
      hostState: state("p2", 10, 14),
      hostStates: [state("p1", 3, 12), state("p2", 11, 20)],
    }

    expect(latestLocalHostState(snapshot, "p1", 3)).toBeNull()
  })
})
