import { setTile } from "./dungeon.js"
import type { ActorId } from "./domainTypes.js"
import type { GameSession } from "./session.js"

export function addEnemyBesidePlayer(session: GameSession, id: string, kind: ActorId, hp: number, damage: number) {
  const target = { x: session.player.x + 1, y: session.player.y }
  setTile(session.dungeon, target, "floor")
  session.dungeon.actors.push({ id, kind, position: target, hp, damage })
  return target
}
