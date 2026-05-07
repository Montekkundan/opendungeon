import { createDungeon, setTile, tileAt, type Actor, type Dungeon, type Point } from "./dungeon.js"

export type MultiplayerMode = "solo" | "coop" | "race"
export type HeroClass = "warden" | "arcanist" | "ranger"

export type Hero = {
  name: string
  classId: HeroClass
  title: string
}

export type CombatSkillId = "strike" | "aimed-shot" | "arcane-burst"

export type CombatSkill = {
  id: CombatSkillId
  name: string
  cost: number
  dc: number
  damage: number
  text: string
}

export type CombatRoll = {
  d20: number
  total: number
  dc: number
  hit: boolean
  critical: boolean
  skill: string
  target: string
}

export type CombatState = {
  active: boolean
  actorIds: string[]
  selectedTarget: number
  selectedSkill: number
  lastRoll?: CombatRoll
  message: string
}

export type GameSession = {
  mode: MultiplayerMode
  hero: Hero
  seed: number
  floor: number
  player: Point
  hp: number
  maxHp: number
  focus: number
  maxFocus: number
  dungeon: Dungeon
  log: string[]
  inventory: string[]
  turn: number
  status: "running" | "dead" | "victory"
  gold: number
  xp: number
  level: number
  kills: number
  finalFloor: number
  visible: Set<string>
  seen: Set<string>
  combat: CombatState
}

const lootEvents = {
  potion: "Potion: +1 deploy nerve.",
  relic: "Relic found: missing env var.",
  chest: "Chest opened: rollback scroll.",
} as const

const heroStats: Record<HeroClass, { title: string; hp: number; focus: number }> = {
  warden: { title: "Warden of Stone", hp: 16, focus: 5 },
  arcanist: { title: "Arcanist of Ash", hp: 10, focus: 10 },
  ranger: { title: "Ranger of Hollow Paths", hp: 12, focus: 7 },
}

export const combatSkills: CombatSkill[] = [
  {
    id: "strike",
    name: "Strike",
    cost: 0,
    dc: 10,
    damage: 3,
    text: "Reliable melee attack.",
  },
  {
    id: "aimed-shot",
    name: "Aimed Shot",
    cost: 1,
    dc: 13,
    damage: 5,
    text: "Harder hit with ranger precision.",
  },
  {
    id: "arcane-burst",
    name: "Arcane Burst",
    cost: 2,
    dc: 15,
    damage: 8,
    text: "High-risk focus spender.",
  },
]

export function createSession(seed = 2423368, mode: MultiplayerMode = "solo", classId: HeroClass = "ranger"): GameSession {
  const dungeon = createDungeon(seed, 1)
  const stats = heroStats[classId]
  const session: GameSession = {
    mode,
    hero: {
      name: "Mira",
      classId,
      title: stats.title,
    },
    seed,
    floor: 1,
    player: { ...dungeon.playerStart },
    hp: stats.hp,
    maxHp: stats.hp,
    focus: stats.focus,
    maxFocus: stats.focus,
    dungeon,
    log: ["Dev jokes hide in loot."],
    inventory: ["Rusty blade", "Dew vial"],
    turn: 0,
    status: "running",
    gold: 0,
    xp: 0,
    level: 1,
    kills: 0,
    finalFloor: 5,
    visible: new Set(),
    seen: new Set(),
    combat: {
      active: false,
      actorIds: [],
      selectedTarget: 0,
      selectedSkill: 0,
      message: "",
    },
  }
  revealAroundPlayer(session)
  return session
}

export function tryMove(session: GameSession, dx: number, dy: number) {
  if (session.status !== "running") return
  if (session.combat.active) {
    session.log.unshift("Initiative is locked. Choose a target and roll.")
    trimLog(session)
    return
  }

  const next = { x: session.player.x + dx, y: session.player.y + dy }
  const actor = actorAt(session.dungeon.actors, next)

  if (actor) {
    startCombat(session, [actor])
    return
  }

  const tile = tileAt(session.dungeon, next)
  if (tile === "wall" || tile === "void") {
    session.log.unshift("Cold stone blocks the way.")
    trimLog(session)
    return
  }

  session.player = next

  if (tile === "stairs") {
    if (hasFinalGuardian(session)) {
      session.log.unshift("The final gate is sealed by the necromancer.")
      trimLog(session)
      return
    }
    descend(session)
    if (session.status === "running") advanceTurn(session)
    else trimLog(session)
    return
  } else if (tile in lootEvents) {
    const lootTile = tile as keyof typeof lootEvents
    session.log.unshift(lootEvents[lootTile])
    session.gold += lootTile === "relic" ? 12 : lootTile === "chest" ? 20 : 4
    session.inventory.unshift(inventoryItem(lootTile))
    setTile(session.dungeon, next, "floor")
  } else {
    session.log.unshift("You move through the dark.")
  }

  advanceTurn(session)
}

export function rest(session: GameSession) {
  if (session.status !== "running") return
  if (session.combat.active) {
    session.log.unshift("No resting while blades are out.")
    trimLog(session)
    return
  }
  session.focus = Math.min(session.maxFocus, session.focus + 1)
  session.log.unshift("You steady your breath. Focus returns.")
  advanceTurn(session)
}

export function usePotion(session: GameSession) {
  if (session.status !== "running") return
  const index = session.inventory.indexOf("Deploy nerve potion")
  if (index < 0) {
    session.log.unshift("No potion in the pack.")
    trimLog(session)
    return
  }

  session.inventory.splice(index, 1)
  session.hp = Math.min(session.maxHp, session.hp + 5)
  session.log.unshift("Potion used. The pulse settles.")
  if (session.combat.active) finishCombatRound(session, true)
  else trimLog(session)
}

export function actorAt(actors: Actor[], point: Point): Actor | undefined {
  return actors.find((actor) => actor.position.x === point.x && actor.position.y === point.y)
}

export function combatTargets(session: GameSession): Actor[] {
  if (!session.combat.active) return []
  const targets = session.combat.actorIds
    .map((id) => session.dungeon.actors.find((actor) => actor.id === id))
    .filter((actor): actor is Actor => Boolean(actor))

  session.combat.actorIds = targets.map((actor) => actor.id)
  if (targets.length === 0) session.combat.selectedTarget = 0
  else session.combat.selectedTarget = clamp(session.combat.selectedTarget, 0, targets.length - 1)

  return targets
}

export function cycleTarget(session: GameSession, delta: number) {
  const targets = combatTargets(session)
  if (targets.length === 0) return
  session.combat.selectedTarget = wrap(session.combat.selectedTarget + delta, targets.length)
  const target = targets[session.combat.selectedTarget]
  session.combat.message = `Targeting ${label(target.kind)}.`
}

export function selectSkill(session: GameSession, index: number) {
  if (!session.combat.active) return
  session.combat.selectedSkill = clamp(index, 0, combatSkills.length - 1)
  const skill = combatSkills[session.combat.selectedSkill]
  session.combat.message = `${skill.name}: d20 + ${proficiency(session)} vs DC ${skill.dc + enemyDefenseBonus(combatTargets(session)[session.combat.selectedTarget]?.kind)}.`
}

export function performCombatAction(session: GameSession) {
  if (session.status !== "running" || !session.combat.active) return
  const targets = combatTargets(session)
  const target = targets[session.combat.selectedTarget]
  if (!target) return

  const skill = combatSkills[session.combat.selectedSkill]
  if (session.focus < skill.cost) {
    session.combat.message = "Not enough focus for that skill."
    session.log.unshift(session.combat.message)
    trimLog(session)
    return
  }

  session.focus -= skill.cost
  const d20 = rollD20(session, skill, target)
  const total = d20 + proficiency(session)
  const dc = skill.dc + enemyDefenseBonus(target.kind)
  const critical = d20 === 20
  const hit = critical || (d20 !== 1 && total >= dc)
  const damage = critical ? skill.damage + session.level + 3 : skill.damage + Math.floor(session.level / 2)

  session.combat.lastRoll = {
    d20,
    total,
    dc,
    hit,
    critical,
    skill: skill.name,
    target: label(target.kind),
  }

  if (hit) {
    target.hp -= damage
    session.combat.message = `${skill.name} hits ${label(target.kind)} for ${damage}.`
    session.log.unshift(`d20 ${d20}+${proficiency(session)} vs DC ${dc}: hit.`)
    if (target.hp <= 0) defeatActor(session, target)
  } else {
    session.combat.message = `${skill.name} misses ${label(target.kind)}.`
    session.log.unshift(`d20 ${d20}+${proficiency(session)} vs DC ${dc}: miss.`)
  }

  if (combatTargets(session).length > 0) finishCombatRound(session, true)
  else {
    endCombat(session, "The room falls silent.")
    finishCombatRound(session, false)
  }
}

function removeActor(actors: Actor[], actor: Actor) {
  const index = actors.indexOf(actor)
  if (index >= 0) actors.splice(index, 1)
}

function startCombat(session: GameSession, actors: Actor[]) {
  const nearby = nearbyHostiles(session)
  const actorIds = [...actors, ...nearby]
    .filter((actor, index, list) => list.findIndex((candidate) => candidate.id === actor.id) === index)
    .map((actor) => actor.id)

  if (actorIds.length === 0) return
  session.combat = {
    active: true,
    actorIds,
    selectedTarget: 0,
    selectedSkill: session.combat.selectedSkill,
    lastRoll: session.combat.lastRoll,
    message: "Initiative rolled. Choose target, choose skill, then roll d20.",
  }
  session.log.unshift("Combat starts. The d20 waits.")
  trimLog(session)
}

function endCombat(session: GameSession, message: string) {
  session.combat.active = false
  session.combat.actorIds = []
  session.combat.selectedTarget = 0
  session.combat.message = message
  session.log.unshift(message)
  trimLog(session)
}

function defeatActor(session: GameSession, actor: Actor) {
  removeActor(session.dungeon.actors, actor)
  session.kills += 1
  session.xp += xpFor(actor.kind)
  session.log.unshift(defeatMessage(actor.kind))
  maybeLevelUp(session)
}

function defeatMessage(kind: Actor["kind"]) {
  if (kind === "slime") return "Slime dissolved. Cache warmed."
  if (kind === "ghoul") return "Ghoul banished. Ticket closed."
  return "Necromancer silenced. Dead branch pruned."
}

function inventoryItem(tile: keyof typeof lootEvents) {
  if (tile === "potion") return "Deploy nerve potion"
  if (tile === "relic") return "Missing env var"
  return "Rollback scroll"
}

function xpFor(kind: Actor["kind"]) {
  if (kind === "necromancer") return 7
  if (kind === "ghoul") return 4
  return 2
}

function maybeLevelUp(session: GameSession) {
  const needed = session.level * 10
  if (session.xp < needed) return
  session.xp -= needed
  session.level += 1
  session.maxHp += 2
  session.maxFocus += 1
  session.hp = Math.min(session.maxHp, session.hp + 4)
  session.focus = session.maxFocus
  session.log.unshift(`Level ${session.level}. The oath hardens.`)
}

function descend(session: GameSession) {
  if (session.floor >= session.finalFloor) {
    session.status = "victory"
    session.log.unshift("The final gate opens. The dungeon releases you.")
    return
  }
  session.floor += 1
  session.dungeon = createDungeon(session.seed, session.floor)
  session.player = { ...session.dungeon.playerStart }
  session.visible = new Set()
  session.seen = new Set()
  session.hp = Math.min(session.maxHp, session.hp + 3)
  session.focus = Math.min(session.maxFocus, session.focus + 2)
  revealAroundPlayer(session)
  session.log.unshift(`Floor ${session.floor}. Same seed, darker shape.`)
}

function advanceTurn(session: GameSession) {
  session.turn += 1
  if (!session.combat.active) moveEnemies(session)
  revealAroundPlayer(session)
  if (session.hp <= 0) {
    session.hp = 0
    session.status = "dead"
    session.log.unshift("You fall beneath the dungeon's build.")
  }
  trimLog(session)
}

function moveEnemies(session: GameSession) {
  for (const actor of [...session.dungeon.actors]) {
    const distance = manhattan(actor.position, session.player)
    if (distance === 1) {
      startCombat(session, [actor])
      return
    }

    if (actor.id === "final-guardian") continue
    if (distance > 8) continue

    const step = stepToward(actor.position, session.player)
    const occupied = actorAt(session.dungeon.actors, step)
    if (tileAt(session.dungeon, step) === "floor" && !occupied) {
      actor.position = step
      if (manhattan(actor.position, session.player) === 1) {
        startCombat(session, [actor])
        return
      }
    }
  }
}

function finishCombatRound(session: GameSession, enemiesAct: boolean) {
  if (enemiesAct) combatEnemyTurn(session)
  session.turn += 1
  revealAroundPlayer(session)
  if (session.hp <= 0) {
    session.hp = 0
    session.status = "dead"
    session.log.unshift("You fall beneath the dungeon's build.")
  }
  combatTargets(session)
  if (session.status === "running" && session.combat.active && session.combat.actorIds.length === 0) endCombat(session, "The room falls silent.")
  trimLog(session)
}

function combatEnemyTurn(session: GameSession) {
  for (const actor of combatTargets(session)) {
    if (manhattan(actor.position, session.player) === 1) {
      session.hp -= actor.damage
      session.log.unshift(`${label(actor.kind)} hits for ${actor.damage}.`)
      continue
    }

    if (actor.id === "final-guardian") continue
    const step = stepToward(actor.position, session.player)
    const occupied = actorAt(session.dungeon.actors, step)
    if (tileAt(session.dungeon, step) === "floor" && !occupied) actor.position = step
  }
}

function stepToward(from: Point, to: Point): Point {
  const dx = Math.sign(to.x - from.x)
  const dy = Math.sign(to.y - from.y)
  if (Math.abs(to.x - from.x) > Math.abs(to.y - from.y)) return { x: from.x + dx, y: from.y }
  return { x: from.x, y: from.y + dy }
}

function manhattan(a: Point, b: Point) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function nearbyHostiles(session: GameSession) {
  return session.dungeon.actors.filter((actor) => {
    const key = pointKey(actor.position)
    return session.visible.has(key) && manhattan(actor.position, session.player) <= 6
  })
}

function proficiency(session: GameSession) {
  const classBonus = session.hero.classId === "ranger" ? 2 : session.hero.classId === "arcanist" ? 1 : 0
  return session.level + classBonus
}

function enemyDefenseBonus(kind: Actor["kind"] | undefined) {
  if (kind === "necromancer") return 4
  if (kind === "ghoul") return 2
  return 0
}

function rollD20(session: GameSession, skill: CombatSkill, target: Actor) {
  const skillSalt = combatSkills.findIndex((candidate) => candidate.id === skill.id) + 1
  const targetSalt = target.id.split("").reduce((total, char) => total + char.charCodeAt(0), 0)
  const value = session.seed * 1103515245 + session.floor * 9973 + session.turn * 7919 + session.kills * 313 + skillSalt * 101 + targetSalt
  return (Math.abs(value) % 20) + 1
}

function label(kind: Actor["kind"]) {
  if (kind === "slime") return "Slime"
  if (kind === "ghoul") return "Ghoul"
  return "Necromancer"
}

function hasFinalGuardian(session: GameSession) {
  return session.dungeon.actors.some((actor) => actor.id === "final-guardian")
}

function trimLog(session: GameSession) {
  while (session.log.length > 8) session.log.pop()
}

function revealAroundPlayer(session: GameSession) {
  const nextVisible = new Set<string>()
  const radius = 10 + Math.floor(session.focus / 2)
  for (let y = session.player.y - radius; y <= session.player.y + radius; y++) {
    for (let x = session.player.x - radius; x <= session.player.x + radius; x++) {
      if (x < 0 || y < 0 || x >= session.dungeon.width || y >= session.dungeon.height) continue
      const point = { x, y }
      if (manhattan(session.player, point) > radius) continue
      if (!hasLineOfSight(session, point)) continue
      const key = pointKey(point)
      nextVisible.add(key)
      session.seen.add(key)
    }
  }
  session.visible = nextVisible
}

function hasLineOfSight(session: GameSession, target: Point) {
  const dx = Math.abs(target.x - session.player.x)
  const dy = Math.abs(target.y - session.player.y)
  const sx = session.player.x < target.x ? 1 : -1
  const sy = session.player.y < target.y ? 1 : -1
  let error = dx - dy
  let x = session.player.x
  let y = session.player.y

  while (x !== target.x || y !== target.y) {
    const doubledError = error * 2
    if (doubledError > -dy) {
      error -= dy
      x += sx
    }
    if (doubledError < dx) {
      error += dx
      y += sy
    }
    if (x === target.x && y === target.y) return true
    if (tileAt(session.dungeon, { x, y }) === "wall") return false
  }

  return true
}

export function pointKey(point: Point) {
  return `${point.x},${point.y}`
}

function wrap(value: number, count: number) {
  return (value + count) % count
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
