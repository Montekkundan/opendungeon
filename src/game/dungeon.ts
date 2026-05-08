import { createRng, type Rng } from "./rng.js"
import { isEnemyActorId, type ActorId, type EnemyActorId, type NpcActorId, type TileId } from "./domainTypes.js"

export type Point = {
  x: number
  y: number
}

export type Actor = {
  id: string
  kind: ActorId
  position: Point
  hp: number
  maxHp?: number
  damage: number
  phase?: number
  ai?: EnemyAi
}

export type Dungeon = {
  width: number
  height: number
  seed: number
  floor: number
  tiles: TileId[][]
  actors: Actor[]
  playerStart: Point
  anchors: DungeonAnchor[]
  secrets: DungeonSecret[]
}

export type DungeonAnchor = {
  id: string
  floor: number
  roomIndex: number
  kind: "start" | "room" | "stairs"
  position: Point
  width: number
  height: number
}

export type DungeonSecret = {
  id: string
  roomIndex: number
  door: Point
  reward: Point
  discovered: boolean
}

export type EnemyPattern = "sentinel" | "wander" | "patrol-horizontal" | "patrol-vertical" | "stalker"

export type EnemyAi = {
  pattern: EnemyPattern
  origin: Point
  aggroRadius: number
  leashRadius: number
  direction: 1 | -1
  alerted: boolean
}

type Room = {
  x: number
  y: number
  width: number
  height: number
}

export function createDungeon(seed: number, floor: number, width = 96, height = 48): Dungeon {
  const rng = createRng(seed + floor * 9973)
  const tiles: TileId[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, (): TileId => "wall"),
  )
  const rooms = createRoomZones(width, height).map((zone) => createRoomInZone(zone, rng))

  for (const room of rooms) {
    carveRoom(tiles, room)

    const previous = rooms[rooms.indexOf(room) - 1]
    if (previous) carveCorridor(tiles, center(previous), center(room), rng)
  }

  const firstRoom = rooms[0] ?? { x: 1, y: 1, width: width - 2, height: height - 2 }
  const lastRoom = rooms.at(-1) ?? firstRoom
  const playerStart = center(firstRoom)

  placeFeature(tiles, center(lastRoom), "stairs")
  scatterFeatures(tiles, rooms, rng)
  const secrets = placeSecretRooms(tiles, rooms, rng, floor)

  const actors = spawnActors(tiles, rooms, rng, floor)
  if (floor >= 5) actors.push(finalGuardian(center(lastRoom), floor))

  return {
    width,
    height,
    seed,
    floor,
    tiles,
    actors,
    playerStart,
    anchors: createDungeonAnchors(rooms, floor),
    secrets,
  }
}

export function tileAt(dungeon: Dungeon, point: Point): TileId {
  return dungeon.tiles[point.y]?.[point.x] ?? "wall"
}

export function setTile(dungeon: Dungeon, point: Point, tile: TileId) {
  if (dungeon.tiles[point.y]?.[point.x]) dungeon.tiles[point.y][point.x] = tile
}

function carveRoom(tiles: TileId[][], room: Room) {
  for (let y = room.y; y < room.y + room.height; y++) {
    for (let x = room.x; x < room.x + room.width; x++) {
      tiles[y][x] = "floor"
    }
  }
}

function carveCorridor(tiles: TileId[][], from: Point, to: Point, rng: Rng) {
  const horizontalFirst = rng.next() > 0.5
  if (horizontalFirst) {
    carveHorizontal(tiles, from.x, to.x, from.y)
    carveVertical(tiles, from.y, to.y, to.x)
  } else {
    carveVertical(tiles, from.y, to.y, from.x)
    carveHorizontal(tiles, from.x, to.x, to.y)
  }
}

function carveHorizontal(tiles: TileId[][], fromX: number, toX: number, y: number) {
  for (let x = Math.min(fromX, toX); x <= Math.max(fromX, toX); x++) tiles[y][x] = "floor"
}

function carveVertical(tiles: TileId[][], fromY: number, toY: number, x: number) {
  for (let y = Math.min(fromY, toY); y <= Math.max(fromY, toY); y++) tiles[y][x] = "floor"
}

function center(room: Room): Point {
  return {
    x: room.x + Math.floor(room.width / 2),
    y: room.y + Math.floor(room.height / 2),
  }
}

function createRoomInZone(zone: Room, rng: Rng): Room {
  const roomWidth = rng.int(Math.max(5, zone.width - 3), zone.width)
  const roomHeight = rng.int(Math.max(4, zone.height - 2), zone.height)

  return {
    width: roomWidth,
    height: roomHeight,
    x: rng.int(zone.x, zone.x + zone.width - roomWidth),
    y: rng.int(zone.y, zone.y + zone.height - roomHeight),
  }
}

function placeFeature(tiles: TileId[][], point: Point, tile: TileId) {
  tiles[point.y][point.x] = tile
}

function randomInteriorPoint(room: Room, rng: Rng): Point {
  return {
    x: rng.int(room.x + 1, room.x + room.width - 2),
    y: rng.int(room.y + 1, room.y + room.height - 2),
  }
}

function scatterFeatures(tiles: TileId[][], rooms: Room[], rng: Rng) {
  const featureTiles: TileId[] = ["potion", "relic", "chest", "trap"]
  for (const room of rooms.slice(1, 18)) {
    const point = randomInteriorPoint(room, rng)
    if (tiles[point.y][point.x] === "floor") tiles[point.y][point.x] = rng.pick(featureTiles)
  }
}

function placeSecretRooms(tiles: TileId[][], rooms: Room[], rng: Rng, floor: number): DungeonSecret[] {
  const candidates = rooms.slice(2, Math.max(3, rooms.length - 1))
  if (!candidates.length) return []
  const count = Math.min(2, Math.max(1, Math.floor(rooms.length / 18)))
  const secrets: DungeonSecret[] = []

  for (let index = 0; index < count; index++) {
    const room = candidates[(rng.int(0, candidates.length - 1) + index * 5) % candidates.length]
    const roomIndex = rooms.indexOf(room)
    const door = secretDoorPoint(tiles, room)
    if (!door || secrets.some((secret) => secret.door.x === door.x && secret.door.y === door.y)) continue
    const reward = randomInteriorPoint(room, rng)
    if (tiles[reward.y][reward.x] === "floor") tiles[reward.y][reward.x] = index % 2 === 0 ? "chest" : "relic"
    tiles[door.y][door.x] = "door"
    secrets.push({
      id: `secret-${floor}-${roomIndex}`,
      roomIndex,
      door,
      reward,
      discovered: false,
    })
  }

  return secrets
}

function secretDoorPoint(tiles: TileId[][], room: Room): Point | null {
  const candidates: Point[] = []
  for (let x = room.x; x < room.x + room.width; x++) {
    candidates.push({ x, y: room.y }, { x, y: room.y + room.height - 1 })
  }
  for (let y = room.y + 1; y < room.y + room.height - 1; y++) {
    candidates.push({ x: room.x, y }, { x: room.x + room.width - 1, y })
  }

  return candidates.find((point) => {
    if (tiles[point.y]?.[point.x] !== "floor") return false
    return cardinalNeighbors(point).some((neighbor) => !insideRoom(neighbor, room) && tiles[neighbor.y]?.[neighbor.x] === "floor")
  }) ?? null
}

function insideRoom(point: Point, room: Room) {
  return point.x >= room.x && point.y >= room.y && point.x < room.x + room.width && point.y < room.y + room.height
}

function cardinalNeighbors(point: Point): Point[] {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 },
  ]
}

function spawnActors(tiles: TileId[][], rooms: Room[], rng: Rng, floor: number): Actor[] {
  const actors: Actor[] = []
  spawnFriendlyActors(actors, tiles, rooms, rng, floor)
  const enemyKinds = enemyKindsForFloor(floor)

  for (const room of rooms.slice(2, 20)) {
    if (rng.next() < 0.35) continue
    const position = freeInteriorPoint(tiles, room, rng, actors)
    if (!position) continue
    const kind = rng.pick(enemyKinds)
    actors.push({ id: `enemy-${actors.length}`, kind, position, ...enemyStats(kind, floor), phase: 1, ai: enemyAi(kind, position, actors.length, floor) })
  }

  return actors
}

function spawnFriendlyActors(actors: Actor[], tiles: TileId[][], rooms: Room[], rng: Rng, floor: number) {
  const merchantRoom = rooms[Math.min(1, rooms.length - 1)]
  if (merchantRoom) placeFriendlyActor(actors, tiles, merchantRoom, rng, "merchant", `merchant-${floor}`)

  const npcKinds: NpcActorId[] = ["cartographer", "wound-surgeon", "shrine-keeper", "jailer"]
  const npcRoom = rooms[Math.min(2 + (floor % 4), rooms.length - 1)]
  if (npcRoom) placeFriendlyActor(actors, tiles, npcRoom, rng, npcKinds[(floor - 1) % npcKinds.length], `npc-${floor}`)
}

function placeFriendlyActor(actors: Actor[], tiles: TileId[][], room: Room, rng: Rng, kind: NpcActorId, id: string) {
  const position = freeInteriorPoint(tiles, room, rng, actors)
  if (!position) return
  actors.push({ id, kind, position, hp: 1, maxHp: 1, damage: 0 })
}

function freeInteriorPoint(tiles: TileId[][], room: Room, rng: Rng, actors: Actor[]): Point | null {
  for (let attempt = 0; attempt < 12; attempt++) {
    const position = randomInteriorPoint(room, rng)
    if (tiles[position.y][position.x] !== "floor") continue
    if (actors.some((actor) => actor.position.x === position.x && actor.position.y === position.y)) continue
    return position
  }
  return null
}

function enemyKindsForFloor(floor: number): EnemyActorId[] {
  if (floor >= 4) return ["ghoul", "necromancer", "gallows-wisp", "rust-squire", "carrion-moth", "crypt-mimic"]
  if (floor >= 2) return ["slime", "ghoul", "gallows-wisp", "rust-squire", "carrion-moth"]
  return ["slime", "ghoul", "rust-squire", "gallows-wisp"]
}

export function enemyAi(kind: ActorId, origin: Point, index = 0, floor = 1): EnemyAi {
  if (!isEnemyActorId(kind)) {
    return {
      pattern: "sentinel",
      origin: { ...origin },
      aggroRadius: 0,
      leashRadius: 0,
      direction: 1,
      alerted: false,
    }
  }

  if (kind === "necromancer" || kind === "grave-root-boss") {
    return {
      pattern: "sentinel",
      origin: { ...origin },
      aggroRadius: kind === "grave-root-boss" ? 10 : 7 + Math.floor(floor / 3),
      leashRadius: kind === "grave-root-boss" ? 15 : 11,
      direction: 1,
      alerted: false,
    }
  }

  if (kind === "ghoul" || kind === "rust-squire") {
    return {
      pattern: index % 2 === 0 ? "patrol-horizontal" : "patrol-vertical",
      origin: { ...origin },
      aggroRadius: kind === "rust-squire" ? 5 : 6,
      leashRadius: kind === "rust-squire" ? 8 : 9,
      direction: index % 2 === 0 ? 1 : -1,
      alerted: false,
    }
  }

  if (kind === "crypt-mimic") {
    return {
      pattern: "sentinel",
      origin: { ...origin },
      aggroRadius: 5 + Math.floor(floor / 3),
      leashRadius: 8,
      direction: 1,
      alerted: false,
    }
  }

  if (kind === "gallows-wisp" || kind === "carrion-moth") {
    return {
      pattern: kind === "gallows-wisp" ? "stalker" : "wander",
      origin: { ...origin },
      aggroRadius: kind === "gallows-wisp" ? 7 : 5,
      leashRadius: kind === "gallows-wisp" ? 10 : 7,
      direction: index % 2 === 0 ? 1 : -1,
      alerted: false,
    }
  }

  return {
    pattern: index % 3 === 0 ? "stalker" : "wander",
    origin: { ...origin },
    aggroRadius: 4,
    leashRadius: 7,
    direction: index % 2 === 0 ? 1 : -1,
    alerted: false,
  }
}

function enemyStats(kind: EnemyActorId, floor: number) {
  if (kind === "grave-root-boss") return withMaxHp(12 + floor, 4)
  if (kind === "necromancer") return withMaxHp(4 + floor, 3)
  if (kind === "crypt-mimic") return withMaxHp(5 + floor, 3)
  if (kind === "rust-squire") return withMaxHp(3 + floor, 2)
  if (kind === "gallows-wisp") return withMaxHp(2 + floor, 2)
  if (kind === "carrion-moth") return withMaxHp(2 + Math.floor(floor / 2), 1)
  if (kind === "ghoul") return withMaxHp(3 + floor, 2)
  return withMaxHp(2 + floor, 1)
}

function withMaxHp(hp: number, damage: number) {
  return { hp, maxHp: hp, damage }
}

function finalGuardian(position: Point, floor: number): Actor {
  return {
    id: "final-guardian",
    kind: "grave-root-boss",
    position,
    hp: 12 + floor,
    maxHp: 12 + floor,
    damage: 4,
    phase: 1,
    ai: {
      ...enemyAi("grave-root-boss", position, 0, floor),
      aggroRadius: 9,
      leashRadius: 14,
    },
  }
}

function createRoomZones(width: number, height: number): Room[] {
  const zones: Room[] = []
  const zoneWidth = 13
  const zoneHeight = 8

  for (let y = 1; y < height - zoneHeight - 1; y += zoneHeight + 1) {
    for (let x = 1; x < width - zoneWidth - 1; x += zoneWidth + 1) {
      zones.push({ x, y, width: zoneWidth, height: zoneHeight })
    }
  }

  return zones
}

function createDungeonAnchors(rooms: Room[], floor: number): DungeonAnchor[] {
  return rooms.map((room, index) => ({
    id: `room-${index.toString().padStart(2, "0")}`,
    floor,
    roomIndex: index,
    kind: index === 0 ? "start" : index === rooms.length - 1 ? "stairs" : "room",
    position: center(room),
    width: room.width,
    height: room.height,
  }))
}
