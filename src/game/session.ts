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
  return {
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
  }
}

export function tryMove(session: GameSession, dx: number, dy: number) {
  const next = { x: session.player.x + dx, y: session.player.y + dy }
  const actor = actorAt(session.dungeon.actors, next)

  if (actor) {
    session.focus = Math.max(0, session.focus - 1)
    removeActor(session.dungeon.actors, actor)
    session.log.unshift(defeatMessage(actor.kind))
    return
  }

  const tile = tileAt(session.dungeon, next)
  if (tile === "wall" || tile === "void") {
    session.log.unshift("Cold stone blocks the way.")
    return
  }

  session.player = next

  if (tile === "stairs") descend(session)
  else if (tile in lootEvents) {
    const lootTile = tile as keyof typeof lootEvents
    session.log.unshift(lootEvents[lootTile])
    session.inventory.unshift(inventoryItem(lootTile))
    setTile(session.dungeon, next, "floor")
  } else {
    session.log.unshift("You move through the dark.")
  }

  trimLog(session)
}

export function actorAt(actors: Actor[], point: Point): Actor | undefined {
  return actors.find((actor) => actor.position.x === point.x && actor.position.y === point.y)
}

function removeActor(actors: Actor[], actor: Actor) {
  const index = actors.indexOf(actor)
  if (index >= 0) actors.splice(index, 1)
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

function descend(session: GameSession) {
  session.floor += 1
  session.dungeon = createDungeon(session.seed, session.floor)
  session.player = { ...session.dungeon.playerStart }
  session.log.unshift(`Floor ${session.floor}. Same seed, darker shape.`)
}

function trimLog(session: GameSession) {
  while (session.log.length > 8) session.log.pop()
}
