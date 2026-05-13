import { describe, expect, test } from "bun:test"
import { createDungeon } from "../game/dungeon.js"
import { createSession } from "../game/session.js"
import { agentObservationSize, HeadlessGameEnv, headlessActionIds, mapFingerprint, validateHeadlessInvariants } from "./env.js"
import { handleProtocolRequest } from "./protocol.js"
import { builtinScenario, loadScenarioFile, runScenario } from "./scenario.js"

describe("headless game env", () => {
  test("exposes a stable discrete action space and action mask", () => {
    const env = new HeadlessGameEnv({ seed: 1234, isolateStorage: true })
    try {
      expect(headlessActionIds).toContain("move-north")
      expect(headlessActionIds).toContain("combat-roll")
      expect(headlessActionIds).toContain("save")
      expect(headlessActionIds).toContain("open-book")
      expect(headlessActionIds).toContain("open-hub")
      expect(headlessActionIds).toContain("open-village")
      expect(headlessActionIds).toContain("build-blacksmith")
      expect(headlessActionIds).toContain("refresh-balance-dashboard")
      expect(env.actionMask()).toHaveLength(headlessActionIds.length)
      expect(env.legalActions()).toContain("noop")
      expect(env.legalActions()).toContain("save")
      expect(env.legalActions()).toContain("open-book")
    } finally {
      env.close()
    }
  })

  test("returns fixed-size agent observations with action masks in step info", () => {
    const env = new HeadlessGameEnv({ seed: 1234, observationMode: "agent", isolateStorage: true })
    try {
      const observation = env.observeAgent()
      const result = env.step("noop")

      expect(observation).toHaveLength(agentObservationSize)
      expect(result.observation).toHaveLength(agentObservationSize)
      expect(result.info.actionMask).toHaveLength(headlessActionIds.length)
      expect(result.info.legalActions).toContain("noop")
    } finally {
      env.close()
    }
  })

  test("replays deterministic action lists", () => {
    const actions = ["rest", "noop", "open-inventory", "close-panel", "open-book", "close-panel"] as const
    const left = new HeadlessGameEnv({ seed: 2222, isolateStorage: true })
    const right = new HeadlessGameEnv({ seed: 2222, isolateStorage: true })
    try {
      const leftReplay = left.replay([...actions], { seed: 2222 })
      const rightReplay = right.replay([...actions], { seed: 2222 })

      expect(leftReplay.finalSnapshot.stateHash).toBe(rightReplay.finalSnapshot.stateHash)
      expect(leftReplay.actions).toEqual(rightReplay.actions)
    } finally {
      left.close()
      right.close()
    }
  })

  test("penalizes illegal forced actions without corrupting state", () => {
    const env = new HeadlessGameEnv({ seed: 1234, isolateStorage: true })
    try {
      const before = env.snapshot()
      const result = env.step("combat-roll")
      const after = env.snapshot()

      expect(result.info.valid).toBe(false)
      expect(result.reward).toBeLessThan(0)
      expect(after.turn).toBe(before.turn)
      expect(env.validateInvariants()).toEqual([])
    } finally {
      env.close()
    }
  })

  test("runs built-in and file-backed scenarios", () => {
    for (const name of ["smoke", "combat", "combat-skills", "area-combat", "boss-phase", "status-effects", "reaction-block", "character-name", "starting-loadout", "biome", "trap", "secret-door", "floor-modifier", "skill-check", "note-collectible", "collectible-variety", "rare-collectibles", "hub-economy", "hub-farming", "village-screen", "village-shop", "village-meta", "first-clear-loop", "run-mutators", "save-load", "save-management", "auth-local", "auth-expired", "map-generation", "npc-event", "npc-conversation", "merchant", "level-up-talent", "dialogue-options", "full-run"]) {
      const scenario = builtinScenario(name)
      expect(scenario).not.toBeNull()
      const result = runScenario(name, scenario!, { seed: 1234 })
      expect(result.failures).toEqual([])
      expect(result.ok).toBe(true)
    }

    const fileResult = runScenario("tests/scenarios/save-load.jsonl", loadScenarioFile("tests/scenarios/save-load.jsonl"), { seed: 1234 })
    expect(fileResult.ok).toBe(true)
  })

  test("keeps procedural dungeons deterministic and seed/floor-specific", () => {
    const sameA = createSession(4242)
    const sameB = createSession(4242)
    const otherSeed = createSession(4243)
    const otherFloor = createSession(4242)
    otherFloor.dungeon = createDungeon(4242, 2)
    otherFloor.floor = 2

    expect(mapFingerprint(sameA)).toBe(mapFingerprint(sameB))
    expect(mapFingerprint(sameA)).not.toBe(mapFingerprint(otherSeed))
    expect(mapFingerprint(sameA)).not.toBe(mapFingerprint(otherFloor))
    expect(sameA.dungeon.secrets.length).toBeGreaterThan(0)
    for (const seed of [1, 2, 3, 1234, 9999]) {
      const session = createSession(seed)
      expect(validateHeadlessInvariants(session)).toEqual([])
    }
  })

  test("keeps map fingerprints stable across turns on the same floor", () => {
    const env = new HeadlessGameEnv({ seed: 1234, isolateStorage: true })
    try {
      const initialMapHash = env.snapshot().mapHash
      env.step("rest")
      env.step("noop")

      expect(env.snapshot().mapHash).toBe(initialMapHash)
    } finally {
      env.close()
    }
  })

  test("saves, loads, and reports local auth in isolated storage", () => {
    const env = new HeadlessGameEnv({ seed: 1234, isolateStorage: true })
    try {
      env.setGold(55)
      const save = env.step("save")
      env.setGold(0)
      const load = env.step("load-latest-save")
      env.saveLocalTestAuth()
      const observation = env.observeTest()

      expect(save.info.saved?.name).toContain("Headless save")
      expect(load.info.loaded?.name).toContain("Headless save")
      expect(observation.session.gold).toBe(55)
      expect(observation.auth.loggedIn).toBe(true)
      expect(observation.auth.username).toBe("test")
      expect(observation.auth.status).toBe("active")
      expect(observation.auth.canRefresh).toBe(true)
      expect(observation.auth.syncAvailable).toBe(true)
    } finally {
      env.close()
    }
  })

  test("handles protocol spec reset step and invariants commands", () => {
    const env = new HeadlessGameEnv({ seed: 1234, observationMode: "agent", isolateStorage: true })
    try {
      const spec = handleProtocolRequest(env, { command: "spec" }) as { actionCount: number; agentObservationSize: number }
      const reset = handleProtocolRequest(env, { command: "reset", seed: 777, observationMode: "agent" }) as ReturnType<HeadlessGameEnv["reset"]>
      const step = handleProtocolRequest(env, { command: "step", action: "noop" }) as ReturnType<HeadlessGameEnv["step"]>
      const invariants = handleProtocolRequest(env, { command: "invariants" }) as { errors: string[] }

      expect(spec.actionCount).toBe(headlessActionIds.length)
      expect(spec.agentObservationSize).toBe(agentObservationSize)
      expect(reset.info.actionMask).toHaveLength(headlessActionIds.length)
      expect(step.info.action).toBe("noop")
      expect(invariants.errors).toEqual([])
    } finally {
      env.close()
    }
  })
})
