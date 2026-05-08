import { createRng, type Rng } from "./rng.js"
import type { ActorId, TileId } from "./domainTypes.js"

export type Point = {
  x: number
  y: number
}

export type Actor = {
  id: string
  kind: ActorId
  position: Point
  hp: number
  damage: number
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

  const actors = spawnActors(tiles, rooms.slice(1), rng, floor)
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
  const featureTiles: TileId[] = ["potion", "relic", "chest"]
  for (const room of rooms.slice(1, 18)) {
    const point = randomInteriorPoint(room, rng)
    if (tiles[point.y][point.x] === "floor") tiles[point.y][point.x] = rng.pick(featureTiles)
  }
}

function spawnActors(tiles: TileId[][], rooms: Room[], rng: Rng, floor: number): Actor[] {
  const actors: Actor[] = []
  const enemyKinds: ActorId[] = floor > 2 ? ["slime", "ghoul", "necromancer"] : ["slime", "ghoul"]

  for (const room of rooms.slice(0, 18)) {
    if (rng.next() < 0.35) continue
    const position = randomInteriorPoint(room, rng)
    if (tiles[position.y][position.x] !== "floor") continue
    const kind = rng.pick(enemyKinds)
    actors.push({ id: `enemy-${actors.length}`, kind, position, ...enemyStats(kind, floor), ai: enemyAi(kind, position, actors.length, floor) })
  }

  return actors
}

export function enemyAi(kind: ActorId, origin: Point, index = 0, floor = 1): EnemyAi {
  if (kind === "necromancer") {
    return {
      pattern: "sentinel",
      origin: { ...origin },
      aggroRadius: 7 + Math.floor(floor / 3),
      leashRadius: 11,
      direction: 1,
      alerted: false,
    }
  }

  if (kind === "ghoul") {
    return {
      pattern: index % 2 === 0 ? "patrol-horizontal" : "patrol-vertical",
      origin: { ...origin },
      aggroRadius: 6,
      leashRadius: 9,
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

function enemyStats(kind: ActorId, floor: number) {
  if (kind === "necromancer") return { hp: 4 + floor, damage: 3 }
  if (kind === "ghoul") return { hp: 3 + floor, damage: 2 }
  return { hp: 2 + floor, damage: 1 }
}

function finalGuardian(position: Point, floor: number): Actor {
  return {
    id: "final-guardian",
    kind: "necromancer",
    position,
    hp: 12 + floor,
    damage: 4,
    ai: {
      ...enemyAi("necromancer", position, 0, floor),
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
