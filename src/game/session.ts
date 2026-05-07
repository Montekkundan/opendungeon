import { createDungeon, setTile, tileAt, type Actor, type Dungeon, type Point } from "./dungeon.js"

export type MultiplayerMode = "solo" | "coop" | "race"
export type HeroClass = "warden" | "arcanist" | "ranger"

export type Hero = {
  name: string
  classId: HeroClass
  title: string
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
  }
  revealAroundPlayer(session)
  return session
}

export function tryMove(session: GameSession, dx: number, dy: number) {
  if (session.status !== "running") return
  const next = { x: session.player.x + dx, y: session.player.y + dy }
  const actor = actorAt(session.dungeon.actors, next)

  if (actor) {
    attack(session, actor)
    advanceTurn(session)
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
  session.focus = Math.min(session.maxFocus, session.focus + 1)
  session.log.unshift("You steady your breath. Focus returns.")
  advanceTurn(session)
}

export function usePotion(session: GameSession) {
  const index = session.inventory.indexOf("Deploy nerve potion")
  if (index < 0) {
    session.log.unshift("No potion in the pack.")
    trimLog(session)
    return
  }

  session.inventory.splice(index, 1)
  session.hp = Math.min(session.maxHp, session.hp + 5)
  session.log.unshift("Potion used. The pulse settles.")
  trimLog(session)
}

export function actorAt(actors: Actor[], point: Point): Actor | undefined {
  return actors.find((actor) => actor.position.x === point.x && actor.position.y === point.y)
}

function removeActor(actors: Actor[], actor: Actor) {
  const index = actors.indexOf(actor)
  if (index >= 0) actors.splice(index, 1)
}

function attack(session: GameSession, actor: Actor) {
  const focusBonus = session.focus > 0 ? 1 : 0
  const levelBonus = Math.floor(session.level / 2)
  actor.hp -= 2 + focusBonus + levelBonus
  session.focus = Math.max(0, session.focus - 1)

  if (actor.hp <= 0) {
    removeActor(session.dungeon.actors, actor)
    session.kills += 1
    session.xp += xpFor(actor.kind)
    maybeLevelUp(session)
    session.log.unshift(defeatMessage(actor.kind))
    return
  }

  session.log.unshift(`You strike the ${actor.kind}. It still stands.`)
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
  moveEnemies(session)
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
      session.hp -= actor.damage
      session.log.unshift(`${label(actor.kind)} hits for ${actor.damage}.`)
      continue
    }

    if (distance > 8) continue

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

function label(kind: Actor["kind"]) {
  if (kind === "slime") return "Slime"
  if (kind === "ghoul") return "Ghoul"
  return "Necromancer"
}

function trimLog(session: GameSession) {
  while (session.log.length > 8) session.log.pop()
}

function revealAroundPlayer(session: GameSession) {
  const nextVisible = new Set<string>()
  const radius = 7 + Math.floor(session.focus / 3)
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
