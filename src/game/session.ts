import { createDungeon, setTile, tileAt, type Actor, type Dungeon, type Point } from "./dungeon.js"

export type MultiplayerMode = "solo" | "coop" | "race"

export type GameSession = {
  mode: MultiplayerMode
  seed: number
  floor: number
  player: Point
  hp: number
  focus: number
  dungeon: Dungeon
  log: string[]
}

const lootEvents = {
  potion: "Potion: +1 deploy nerve.",
  relic: "Relic found: missing env var.",
  chest: "Chest opened: rollback scroll.",
} as const

export function createSession(seed = 2423368, mode: MultiplayerMode = "solo"): GameSession {
  const dungeon = createDungeon(seed, 1)
  return {
    mode,
    seed,
    floor: 1,
    player: { ...dungeon.playerStart },
    hp: 12,
    focus: 7,
    dungeon,
    log: ["Dev jokes hide in loot."],
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
    session.log.unshift(lootEvents[tile as keyof typeof lootEvents])
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

function descend(session: GameSession) {
  session.floor += 1
  session.dungeon = createDungeon(session.seed, session.floor)
  session.player = { ...session.dungeon.playerStart }
  session.log.unshift(`Floor ${session.floor}. Same seed, darker shape.`)
}

function trimLog(session: GameSession) {
  while (session.log.length > 8) session.log.pop()
}
