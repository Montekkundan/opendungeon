import { describe, expect, test } from "bun:test"
import {
  applyStatusEffect,
  attemptFlee,
  combatModifier,
  combatSkills,
  createSession,
  performCombatAction,
  resolveSkillCheck,
  selectSkill,
  statusEffectMagnitude,
  statusEffectsFor,
  tryMove,
  usePotion,
} from "./session.js"
import type { GameSession } from "./session.js"
import { setTile } from "./dungeon.js"
import type { ActorId } from "./domainTypes.js"

function addEnemyBesidePlayer(session: GameSession, id: string, kind: ActorId, hp: number, damage: number) {
  const target = { x: session.player.x + 1, y: session.player.y }
  setTile(session.dungeon, target, "floor")
  session.dungeon.actors.push({ id, kind, position: target, hp, damage })
  return target
}

function startTwoEnemyFight(session: GameSession) {
  addEnemyBesidePlayer(session, "initiative-slime", "slime", 20, 1)
  const second = { x: session.player.x, y: session.player.y + 1 }
  setTile(session.dungeon, second, "floor")
  session.dungeon.actors.push({ id: "initiative-ghoul", kind: "ghoul", position: second, hp: 20, damage: 1 })
  tryMove(session, 1, 0)
  return session.combat.initiative.map((entry) => ({ id: entry.id, roll: entry.roll, modifier: entry.modifier, total: entry.total }))
}

describe("d20 combat and skill checks", () => {
  test("resolves loot checks into inventory consequences", () => {
    const session = createSession(1234)
    const target = { x: session.player.x + 1, y: session.player.y }
    setTile(session.dungeon, target, "potion")

    tryMove(session, 1, 0)
    expect(session.skillCheck?.status).toBe("pending")

    resolveSkillCheck(session)

    expect(session.inventory[0]).not.toBe("Rusty blade")
    expect(session.dungeon.tiles[target.y][target.x]).toBe("floor")
  })

  test("bumping an enemy enters d20 combat", () => {
    const session = createSession(1234)
    addEnemyBesidePlayer(session, "test-slime", "slime", 6, 1)

    tryMove(session, 1, 0)

    expect(session.combat.active).toBe(true)
    expect(session.combat.actorIds).toContain("test-slime")
    expect(session.log[0]).toContain("Combat starts")
  })

  test("rolls deterministic initiative order on combat start", () => {
    const left = createSession(1234)
    const right = createSession(1234)

    const leftOrder = startTwoEnemyFight(left)
    const rightOrder = startTwoEnemyFight(right)

    expect(leftOrder).toEqual(rightOrder)
    expect(left.combat.round).toBe(1)
    expect(left.combat.initiative.map((entry) => entry.id)).toContain("player")
    expect(left.combat.initiative.map((entry) => entry.id)).toContain("initiative-slime")
    expect(left.combat.initiative.map((entry) => entry.id)).toContain("initiative-ghoul")
    expect(left.combat.initiative.every((entry) => entry.roll >= 1 && entry.roll <= 20)).toBe(true)
    expect(left.log[0]).toContain("Initiative:")
  })

  test("combat action rolls d20 against selected target", () => {
    const session = createSession(1234)
    addEnemyBesidePlayer(session, "test-ghoul", "ghoul", 20, 0)

    tryMove(session, 1, 0)
    selectSkill(session, 0)
    performCombatAction(session)

    expect(session.combat.lastRoll?.d20).toBeGreaterThanOrEqual(1)
    expect(session.combat.lastRoll?.d20).toBeLessThanOrEqual(20)
    expect(session.combat.lastRoll?.modifier).toBe(combatModifier(session, "strength"))
    expect(session.turn).toBe(1)
  })

  test("supports expanded combat skills beyond the original three slots", () => {
    const session = createSession(1234)
    const target = { x: session.player.x + 1, y: session.player.y }
    setTile(session.dungeon, target, "floor")
    session.stats.faith = 40
    session.focus = session.maxFocus
    session.dungeon.actors.push({
      id: "test-necromancer",
      kind: "necromancer",
      position: target,
      hp: 20,
      damage: 0,
    })

    tryMove(session, 1, 0)
    selectSkill(session, 3)
    performCombatAction(session)

    expect(combatSkills.length).toBeGreaterThanOrEqual(6)
    expect(session.combat.lastRoll?.skill).toBe("Smite")
    expect(session.combat.lastRoll?.modifier).toBe(combatModifier(session, "faith"))
  })

  test("uses area combat skills against all active targets", () => {
    const session = createSession(1234)
    addEnemyBesidePlayer(session, "aoe-ghoul", "ghoul", 10, 0)
    const second = { x: session.player.x, y: session.player.y + 1 }
    setTile(session.dungeon, second, "floor")
    session.dungeon.actors.push({ id: "aoe-slime", kind: "slime", position: second, hp: 5, damage: 0 })
    session.stats.intelligence = 60
    session.focus = session.maxFocus

    tryMove(session, 1, 0)
    expect(session.combat.actorIds).toContain("aoe-ghoul")
    expect(session.combat.actorIds).toContain("aoe-slime")

    selectSkill(session, 2)
    performCombatAction(session)

    expect(session.combat.lastRoll?.skill).toBe("Arcane Burst")
    expect(session.kills).toBeGreaterThanOrEqual(2)
    expect(session.dungeon.actors.some((actor) => actor.id === "aoe-ghoul" || actor.id === "aoe-slime")).toBe(false)
  })

  test("advances necromancer bosses into a stronger second phase", () => {
    const session = createSession(1234)
    addEnemyBesidePlayer(session, "phase-necromancer", "necromancer", 30, 3)
    const boss = session.dungeon.actors.find((actor) => actor.id === "phase-necromancer")!
    boss.maxHp = 30
    session.stats.strength = 60

    tryMove(session, 1, 0)
    selectSkill(session, 0)
    performCombatAction(session)

    expect(boss.phase).toBe(2)
    expect(boss.damage).toBe(5)
    expect(session.hp).toBe(session.maxHp - 5)
    expect(session.log.some((entry) => entry.includes("phase 2"))).toBe(true)
  })

  test("applies combat status effects, damage reduction, and expiry", () => {
    const session = createSession(1234)
    const target = addEnemyBesidePlayer(session, "test-necromancer", "necromancer", 80, 5)
    session.stats.mind = 60
    session.focus = session.maxFocus

    tryMove(session, 1, 0)
    selectSkill(session, 4)
    performCombatAction(session)

    expect(session.combat.lastRoll?.skill).toBe("Shadow Hex")
    expect(statusEffectMagnitude(session, "test-necromancer", "weakened")).toBe(2)
    expect(statusEffectsFor(session, "test-necromancer")[0]?.remainingTurns).toBe(1)
    expect(session.hp).toBe(session.maxHp - 3)

    setTile(session.dungeon, target, "floor")
    selectSkill(session, 0)
    performCombatAction(session)

    expect(statusEffectMagnitude(session, "test-necromancer", "weakened")).toBe(0)
    expect(session.hp).toBe(session.maxHp - 6)
  })

  test("blocks enemy damage and triggers riposte reactions", () => {
    const session = createSession(1234)
    addEnemyBesidePlayer(session, "riposte-ghoul", "ghoul", 20, 5)
    applyStatusEffect(session, {
      id: "guarded",
      targetId: "player",
      label: "Guarded",
      remainingTurns: 2,
      magnitude: 2,
      source: "Lucky Riposte",
    })
    session.inventory.unshift("Deploy nerve potion")
    const actor = session.dungeon.actors.find((candidate) => candidate.id === "riposte-ghoul")!

    tryMove(session, 1, 0)
    usePotion(session)

    expect(session.hp).toBe(session.maxHp - 3)
    expect(actor.hp).toBe(19)
    expect(session.log.some((entry) => entry.includes("Block reaction absorbs 2"))).toBe(true)
    expect(session.log.some((entry) => entry.includes("Riposte reaction"))).toBe(true)
  })

  test("refreshes same-target status effect stacks without duplicating them", () => {
    const session = createSession(1234)

    applyStatusEffect(session, {
      id: "guarded",
      targetId: "player",
      label: "Guarded",
      remainingTurns: 1,
      magnitude: 1,
      source: "test",
    })
    applyStatusEffect(session, {
      id: "guarded",
      targetId: "player",
      label: "Guarded",
      remainingTurns: 3,
      magnitude: 2,
      source: "test",
    })

    expect(statusEffectsFor(session, "player")).toHaveLength(1)
    expect(statusEffectsFor(session, "player")[0]).toMatchObject({ remainingTurns: 3, magnitude: 2 })
  })

  test("flee rolls d20 against dexterity luck and endurance pressure", () => {
    const session = createSession(1234)
    session.stats.dexterity = 30
    session.stats.luck = 30
    session.stats.endurance = 30
    addEnemyBesidePlayer(session, "test-slime", "slime", 6, 0)

    tryMove(session, 1, 0)
    const roll = attemptFlee(session)

    expect(roll?.skill).toBe("Flee")
    expect(roll?.hit).toBe(true)
    expect(session.combat.active).toBe(false)
    expect(session.turn).toBe(1)
  })

  test("loot tiles trigger stat checks with consequences", () => {
    const session = createSession(1234, "solo", "ranger")
    const target = { x: session.player.x + 1, y: session.player.y }
    setTile(session.dungeon, target, "chest")

    tryMove(session, 1, 0)

    expect(session.skillCheck?.status).toBe("pending")
    expect(session.skillCheck?.stat).toBe("dexterity")
    expect(session.player).toEqual(target)

    const roll = resolveSkillCheck(session)

    expect(roll?.d20).toBeGreaterThanOrEqual(1)
    expect(roll?.d20).toBeLessThanOrEqual(20)
    expect(session.skillCheck?.status).toBe("resolved")
    expect(session.skillCheck?.roll?.total).toBe((roll?.d20 ?? 0) + (roll?.modifier ?? 0))
    expect(session.dungeon.tiles[target.y][target.x]).toBe("floor")
    expect(session.turn).toBe(1)
  })
})
