import { createRng, type Rng } from "./rng.js"
import type { ActorId, TileId } from "../assets/packs.js"

export type Point = {
  x: number
  y: number
}

export type Actor = {
  id: string
  kind: ActorId
  position: Point
}

export type Dungeon = {
  width: number
  height: number
  seed: number
  floor: number
  tiles: TileId[][]
  actors: Actor[]
  playerStart: Point
}

type Room = {
  x: number
  y: number
  width: number
  height: number
}

export function createDungeon(seed: number, floor: number, width = 38, height = 18): Dungeon {
  const rng = createRng(seed + floor * 9973)
  const tiles: TileId[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, (): TileId => "wall"),
  )
  const zones = [
    { x: 1, y: 1, width: 12, height: 7 },
    { x: 14, y: 1, width: 11, height: 7 },
    { x: 26, y: 2, width: 11, height: 7 },
    { x: 2, y: 10, width: 13, height: 7 },
    { x: 17, y: 10, width: 19, height: 7 },
  ]
  const rooms = zones.map((zone) => createRoomInZone(zone, rng))

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

  return {
    width,
    height,
    seed,
    floor,
    tiles,
    actors: spawnActors(tiles, rooms.slice(1), rng, floor),
    playerStart,
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

function scatterFeatures(tiles: TileId[][], rooms: Room[], rng: Rng) {
  const featureTiles: TileId[] = ["potion", "relic", "chest"]
  for (const room of rooms.slice(1, 5)) {
    const point = {
      x: rng.int(room.x + 1, room.x + room.width - 2),
      y: rng.int(room.y + 1, room.y + room.height - 2),
    }
    if (tiles[point.y][point.x] === "floor") tiles[point.y][point.x] = rng.pick(featureTiles)
  }
}

function spawnActors(tiles: TileId[][], rooms: Room[], rng: Rng, floor: number): Actor[] {
  const actors: Actor[] = []
  const enemyKinds: ActorId[] = floor > 2 ? ["slime", "ghoul", "necromancer"] : ["slime", "ghoul"]

  for (const room of rooms.slice(0, 5)) {
    if (rng.next() < 0.35) continue
    const position = {
      x: rng.int(room.x + 1, room.x + room.width - 2),
      y: rng.int(room.y + 1, room.y + room.height - 2),
    }
    if (tiles[position.y][position.x] !== "floor") continue
    actors.push({ id: `enemy-${actors.length}`, kind: rng.pick(enemyKinds), position })
  }

  return actors
}
