import { StyledText, fg, type TextChunk } from "@opentui/core"
import { activeAssetPack, type GlyphStyle } from "../assets/packs.js"
import { actorAt, type GameSession } from "../game/session.js"

export function renderMap(session: GameSession): StyledText {
  const chunks: TextChunk[] = []

  for (let y = 0; y < session.dungeon.height; y++) {
    for (let x = 0; x < session.dungeon.width; x++) {
      const actor = actorAt(session.dungeon.actors, { x, y })
      const style =
        session.player.x === x && session.player.y === y
          ? activeAssetPack.actors.player
          : actor
            ? activeAssetPack.actors[actor.kind]
            : activeAssetPack.tiles[session.dungeon.tiles[y][x]]

      chunks.push(toChunk(style))
    }

    if (y < session.dungeon.height - 1) chunks.push(toChunk({ glyph: "\n", fg: "#36595a" }))
  }

  return new StyledText(chunks)
}

function toChunk(style: GlyphStyle): TextChunk {
  return fg(style.fg)(style.glyph)
}
