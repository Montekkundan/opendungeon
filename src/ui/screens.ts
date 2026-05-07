import { activeAssetPack } from "../assets/packs.js"
import { actorAt, pointKey, type GameSession, type HeroClass, type MultiplayerMode } from "../game/session.js"
import { Canvas } from "./canvas.js"

type TileRenderStyle = {
  fg: string
  bg?: string
  pattern: string[]
}

export type ScreenId = "start" | "character" | "mode" | "game"
export type DialogId = "settings" | "inventory" | "help" | "pause" | null

export type AppModel = {
  screen: ScreenId
  dialog: DialogId
  menuIndex: number
  classIndex: number
  modeIndex: number
  seed: number
  session: GameSession
  message: string
  debugView: boolean
  rendererBackend: "terminal" | "three"
}

const startItems = ["Begin descent", "Character", "Multiplayer", "Settings", "Quit"]
const classOptions: Array<{ id: HeroClass; name: string; text: string }> = [
  { id: "warden", name: "Warden", text: "High HP, low focus. Holds corridors." },
  { id: "arcanist", name: "Arcanist", text: "Low HP, high focus. Deletes threats." },
  { id: "ranger", name: "Ranger", text: "Balanced. Best first run." },
]
const modeOptions: Array<{ id: MultiplayerMode; name: string; text: string }> = [
  { id: "solo", name: "Solo", text: "One crawl, local run." },
  { id: "coop", name: "Co-op", text: "Shared dungeon host. Network hook later." },
  { id: "race", name: "Race", text: "Same seed, separate runs. Fastest descent wins." },
]

export function draw(model: AppModel, width: number, height: number) {
  const canvas = new Canvas(width, height, "#111820")

  if (model.screen === "start") drawStart(canvas, model)
  if (model.screen === "character") drawCharacter(canvas, model)
  if (model.screen === "mode") drawMode(canvas, model)
  if (model.screen === "game") drawGame(canvas, model)
  if (model.dialog) drawDialog(canvas, model)

  return canvas.toStyledText()
}

export function currentStartItem(model: AppModel) {
  return startItems[model.menuIndex]
}

export function currentClass(model: AppModel) {
  return classOptions[model.classIndex]
}

export function currentMode(model: AppModel) {
  return modeOptions[model.modeIndex]
}

export function moveSelection(model: AppModel, delta: number) {
  const count = model.screen === "character" ? classOptions.length : model.screen === "mode" ? modeOptions.length : startItems.length
  if (model.screen === "game") return
  model.menuIndex = wrap(model.menuIndex + delta, count)
  if (model.screen === "character") model.classIndex = model.menuIndex
  if (model.screen === "mode") model.modeIndex = model.menuIndex
}

function drawStart(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed)
  canvas.center(3, "DUNGEON DEV CRAWL", "#d6a85c")
  canvas.center(5, "A fantasy roguelike where cursed relics sometimes look like deploy tools.", "#8f9ba8")
  canvas.center(7, `Asset pack: ${activeAssetPack.name} by ${activeAssetPack.author} (${activeAssetPack.license})`, "#66717d")
  canvas.center(9, `${currentClass(model).name} · ${currentMode(model).name} · Seed ${model.seed}`, "#8f9ba8")

  const menuX = Math.max(4, Math.floor(canvas.width / 2) - 16)
  const menuY = Math.max(11, Math.floor(canvas.height / 2) - 4)
  startItems.forEach((item, index) => {
    const selected = model.menuIndex === index
    canvas.write(menuX, menuY + index * 2, `${selected ? ">" : " "} ${item}`, selected ? "#f4d06f" : "#d8dee9")
  })

  canvas.center(canvas.height - 4, "Enter select  ↑↓ navigate  n new seed  ? help  q quit", "#66717d")
}

function drawCharacter(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 2)
  canvas.center(3, "CHOOSE YOUR CRAWLER", "#d6a85c")
  const x = Math.max(4, Math.floor(canvas.width / 2) - 28)
  const y = Math.max(8, Math.floor(canvas.height / 2) - 5)

  classOptions.forEach((option, index) => {
    const selected = model.classIndex === index
    canvas.write(x, y + index * 4, `${selected ? ">" : " "} ${option.name}`, selected ? "#f4d06f" : "#d8dee9")
    canvas.write(x + 4, y + index * 4 + 1, option.text, selected ? "#b5bec6" : "#66717d")
  })

  canvas.center(canvas.height - 4, "Enter confirm  Esc start", "#66717d")
}

function drawMode(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 4)
  canvas.center(3, "RUN MODE", "#d6a85c")
  const x = Math.max(4, Math.floor(canvas.width / 2) - 31)
  const y = Math.max(8, Math.floor(canvas.height / 2) - 5)

  modeOptions.forEach((option, index) => {
    const selected = model.modeIndex === index
    canvas.write(x, y + index * 4, `${selected ? ">" : " "} ${option.name}`, selected ? "#f4d06f" : "#d8dee9")
    canvas.write(x + 4, y + index * 4 + 1, option.text, selected ? "#b5bec6" : "#66717d")
  })

  canvas.center(canvas.height - 5, `Host lobby: bun run host -- --mode ${currentMode(model).id} --seed ${model.seed}`, "#66717d")
  canvas.center(canvas.height - 3, "Friends run with the shared DUNGEON_MODE and DUNGEON_SEED shown by the lobby.", "#66717d")
}

function drawGame(canvas: Canvas, model: AppModel) {
  const session = model.session
  drawMap(canvas, session, model.debugView)
  drawHud(canvas, session)
  drawBottomLog(canvas, session)
  if (session.status !== "running") drawRunEnd(canvas, session)
}

function drawMap(canvas: Canvas, session: GameSession, debugView: boolean) {
  const tileWidth = debugView ? 2 : 6
  const tileHeight = debugView ? 1 : 3
  const hudHeight = 4
  const logHeight = 6
  const viewWidth = Math.floor(canvas.width / tileWidth)
  const viewHeight = Math.max(4, Math.floor((canvas.height - hudHeight - logHeight) / tileHeight))
  const startX = Math.max(0, session.player.x - Math.floor(viewWidth / 2))
  const startY = Math.max(0, session.player.y - Math.floor(viewHeight / 2))

  for (let sy = 0; sy < viewHeight; sy++) {
    for (let sx = 0; sx < viewWidth; sx++) {
      const x = startX + sx
      const y = startY + sy
      const point = { x, y }
      const visible = session.visible.has(pointKey(point))
      const seen = session.seen.has(pointKey(point))
      const actor = visible ? actorAt(session.dungeon.actors, point) : undefined
      const style = tileStyle(session, x, y, debugView, visible, seen)
      const screenX = sx * tileWidth
      const screenY = hudHeight + sy * tileHeight
      drawTileBlock(canvas, screenX, screenY, tileWidth, tileHeight, style)

      if (session.player.x === x && session.player.y === y) drawSprite(canvas, screenX, screenY, tileWidth, tileHeight, "hero", debugView)
      else if (actor) drawSprite(canvas, screenX, screenY, tileWidth, tileHeight, actor.kind, debugView)
    }
  }
}

function tileStyle(session: GameSession, x: number, y: number, debugView: boolean, visible: boolean, seen: boolean): TileRenderStyle {
  const tile = session.dungeon.tiles[y]?.[x] ?? "void"
  if (debugView) return debugTileStyle(session, x, y)
  if (!seen) return { pattern: ["      ", "      ", "      "], fg: "#05070a", bg: "#05070a" }
  if (tile === "floor") return floorStyle(x, y, visible)
  if (tile === "wall") return wallStyle(x, y, visible)
  if (tile === "stairs") return visible ? { pattern: [" /==\\ ", " |  | ", " \\==/ "], fg: "#2d1d17", bg: "#b4915a" } : floorStyle(x, y, false)
  if (tile === "potion") return visible ? { pattern: ["      ", "  ●   ", "      "], fg: "#f4a6b8", bg: textureColor(x, y) } : floorStyle(x, y, false)
  if (tile === "relic") return visible ? { pattern: ["      ", "  ◆   ", "      "], fg: "#f4d06f", bg: textureColor(x, y) } : floorStyle(x, y, false)
  if (tile === "chest") return visible ? { pattern: ["      ", " [▤]  ", "      "], fg: "#f4d06f", bg: "#9a6c4e" } : floorStyle(x, y, false)
  return { pattern: ["      ", "      ", "      "], fg: "#05070a", bg: "#05070a" }
}

function debugTileStyle(session: GameSession, x: number, y: number): TileRenderStyle {
  const tile = session.dungeon.tiles[y]?.[x] ?? "void"
  if (tile === "floor") return { pattern: ["··"], fg: "#36595a" }
  if (tile === "wall") return { pattern: ["██"], fg: "#3b3f46" }
  if (tile === "stairs") return { pattern: [">>"], fg: "#f4d06f" }
  if (tile === "potion") return { pattern: ["!!"], fg: "#d56b8c" }
  if (tile === "relic") return { pattern: ["$$"], fg: "#d6a85c" }
  if (tile === "chest") return { pattern: ["[]"], fg: "#c38b6a" }
  return { pattern: ["  "], fg: "#05070a" }
}

function drawTileBlock(canvas: Canvas, x: number, y: number, width: number, height: number, style: TileRenderStyle) {
  for (let row = 0; row < height; row++) {
    const pattern = fitPattern(style.pattern[row] ?? style.pattern.at(-1) ?? "", width)
    canvas.write(x, y + row, pattern, style.fg, style.bg)
  }
}

function drawSprite(canvas: Canvas, x: number, y: number, width: number, height: number, sprite: "hero" | "player" | "slime" | "ghoul" | "necromancer", debugView: boolean) {
  if (debugView) {
    const debugGlyph = sprite === "hero" ? "@@" : activeAssetPack.actors[sprite].glyph.repeat(2)
    canvas.write(x, y, debugGlyph, sprite === "hero" ? "#f4d06f" : activeAssetPack.actors[sprite].fg)
    return
  }

  const lines = spriteLines(sprite)
  const fgColor = spriteColor(sprite)
  const offsetY = Math.max(0, Math.floor((height - lines.length) / 2))
  for (let row = 0; row < Math.min(height, lines.length); row++) {
    canvas.write(x, y + offsetY + row, fitPattern(lines[row], width), fgColor, "#24484a")
  }
}

function floorStyle(x: number, y: number, visible: boolean): TileRenderStyle {
  const bg = visible ? textureColor(x, y) : dimTextureColor(x, y)
  const fg = visible ? "#5b7f7a" : "#253a3b"
  const n = (x * 5 + y * 9) % 4
  if (n === 0) return { pattern: ["      ", "  ░   ", "      "], fg, bg }
  if (n === 1) return { pattern: ["   ░  ", "      ", "      "], fg, bg }
  if (n === 2) return { pattern: ["      ", "      ", " ░    "], fg, bg }
  return { pattern: ["      ", "      ", "     ░"], fg, bg }
}

function wallStyle(x: number, y: number, visible: boolean): TileRenderStyle {
  const bg = visible ? stoneColor(x, y) : "#171a1f"
  const fg = visible ? "#777f8b" : "#282e36"
  return { pattern: ["▛▀▀▀▜", "▌▒▒▒▐", "▙▄▄▄▟"], fg, bg }
}

function spriteLines(sprite: "hero" | "player" | "slime" | "ghoul" | "necromancer") {
  if (sprite === "hero") return ["  o   ", " /█\\  ", " / \\  "]
  if (sprite === "slime") return ["      ", " ◖▰◗  ", "  ▔   "]
  if (sprite === "ghoul") return ["  ◉   ", " /▓\\  ", " / \\  "]
  return ["  ☾   ", " /▓\\  ", "  ║   "]
}

function spriteColor(sprite: "hero" | "player" | "slime" | "ghoul" | "necromancer") {
  if (sprite === "hero") return "#f4d06f"
  if (sprite === "slime") return "#91d66f"
  if (sprite === "ghoul") return "#c5cbd3"
  return "#c892d7"
}

function textureColor(x: number, y: number) {
  const n = (x * 13 + y * 17) % 7
  if (n === 0) return "#305b58"
  if (n === 1) return "#24484a"
  if (n === 2) return "#2b5350"
  return "#203d40"
}

function dimTextureColor(x: number, y: number) {
  const n = (x * 13 + y * 17) % 7
  if (n === 0) return "#172b2c"
  if (n === 1) return "#132326"
  if (n === 2) return "#162729"
  return "#101c1f"
}

function stoneColor(x: number, y: number) {
  const n = (x * 11 + y * 19) % 6
  if (n === 0) return "#535963"
  if (n === 1) return "#454b54"
  return "#3b4048"
}

function drawHud(canvas: Canvas, session: GameSession) {
  const hero = trim(`${session.hero.name} · ${session.hero.title}`, Math.max(16, canvas.width - 34))
  canvas.write(1, 0, hero, "#d8dee9")
  writeRight(canvas, 0, `Floor ${session.floor}/${session.finalFloor}  Seed ${session.seed}`, "#d6a85c")

  const hpBar = bar("HP", session.hp, session.maxHp, canvas.width < 90 ? 10 : 18)
  const focusBar = bar("FOCUS", session.focus, session.maxFocus, canvas.width < 90 ? 8 : 14)
  canvas.write(1, 1, hpBar, "#d56b8c")
  canvas.write(Math.min(canvas.width - 1, hpBar.length + 4), 1, focusBar, "#7dffb2")

  const progress = `LV ${session.level}  XP ${session.xp}/${session.level * 10}  Gold ${session.gold}`
  if (canvas.width >= 96) canvas.write(55, 2, progress, "#d6a85c")
  else writeRight(canvas, 2, progress, "#d6a85c")

  if (canvas.width >= 96) canvas.write(canvas.width - 38, 1, `Mode ${session.mode}  Art ${activeAssetPack.name}`, "#8f9ba8")
  const status = session.status === "running" ? `Turn ${session.turn}` : session.status.toUpperCase()
  if (canvas.width >= 96) canvas.write(canvas.width - 38, 2, status, session.status === "dead" ? "#d56b8c" : "#66717d")
  canvas.write(1, 2, trim("i inventory   h potion   r rest   ? help   esc pause", canvas.width < 96 ? canvas.width - progress.length - 4 : 50), "#66717d")
}

function writeRight(canvas: Canvas, y: number, text: string, color: string) {
  canvas.write(Math.max(1, canvas.width - text.length - 2), y, text, color)
}

function drawBottomLog(canvas: Canvas, session: GameSession) {
  const y = Math.max(0, canvas.height - 5)
  canvas.write(1, y, "LOG", "#d6a85c")
  session.log.slice(0, 4).forEach((line, index) => canvas.write(1, y + index + 1, trim(line, canvas.width - 2), index === 0 ? "#d8dee9" : "#8f9ba8"))
}

function drawDialog(canvas: Canvas, model: AppModel) {
  const width = Math.min(70, canvas.width - 8)
  const height = model.dialog === "inventory" ? 14 : 11
  const x = Math.floor((canvas.width - width) / 2)
  const y = Math.floor((canvas.height - height) / 2)
  canvas.fill(x, y, width, height, " ", "#05070a")
  canvas.border(x, y, width, height, "#d6a85c")

  if (model.dialog === "settings") {
    canvas.write(x + 3, y + 2, "Settings", "#f4d06f")
    canvas.write(x + 3, y + 4, `Seed: ${model.seed}`, "#d8dee9")
    canvas.write(x + 3, y + 5, `Renderer: ${model.rendererBackend === "three" ? "@opentui/three asset backend" : "Dawngeon asset tiles"}`, "#8f9ba8")
    canvas.write(x + 3, y + 6, "Host: bun run host -- --mode race --seed " + model.seed, "#8f9ba8")
    canvas.write(x + 3, y + 7, `Debug view: ${model.debugView ? "on" : "off"} (DUNGEON_DEBUG_VIEW=1)`, "#66717d")
    canvas.write(x + 3, y + 8, "Lobby results auto-post when DUNGEON_LOBBY_URL is set.", "#66717d")
  }

  if (model.dialog === "inventory") {
    canvas.write(x + 3, y + 2, "Inventory", "#f4d06f")
    model.session.inventory.slice(0, 8).forEach((item, index) => canvas.write(x + 3, y + 4 + index, `- ${item}`, "#d8dee9"))
  }

  if (model.dialog === "help") {
    canvas.write(x + 3, y + 2, "Controls", "#f4d06f")
    canvas.write(x + 3, y + 4, "Move: arrows/WASD    Confirm: Enter    Back: Esc", "#d8dee9")
    canvas.write(x + 3, y + 5, "Inventory: i         Potion: h         Rest: r", "#d8dee9")
    canvas.write(x + 3, y + 7, "Bump enemies to attack. Stairs descend to a generated floor.", "#8f9ba8")
  }

  if (model.dialog === "pause") {
    canvas.write(x + 3, y + 2, "Paused", "#f4d06f")
    canvas.write(x + 3, y + 4, "Esc resumes. s opens settings. q quits.", "#d8dee9")
    canvas.write(x + 3, y + 6, "The game keeps one shared seed so race mode can replay fairly.", "#8f9ba8")
  }

  canvas.center(y + height - 2, "Esc close", "#66717d")
}

function drawRunEnd(canvas: Canvas, session: GameSession) {
  const width = Math.min(68, canvas.width - 8)
  const height = 13
  const x = Math.floor((canvas.width - width) / 2)
  const y = Math.floor((canvas.height - height) / 2)
  canvas.fill(x, y, width, height, " ", "#05070a", "#05070a")
  canvas.border(x, y, width, height, session.status === "victory" ? "#f4d06f" : "#d56b8c")

  const title = session.status === "victory" ? "VICTORY" : "YOU FELL"
  const body =
    session.status === "victory"
      ? "The final gate opens. The dungeon releases its claim."
      : "The dungeon closes around your unfinished oath."

  canvas.center(y + 2, title, session.status === "victory" ? "#f4d06f" : "#d56b8c")
  canvas.center(y + 4, body, "#d8dee9")
  canvas.center(y + 6, `Score ${runScore(session)}  Floor ${session.floor}/${session.finalFloor}  Turns ${session.turn}`, "#f4d06f")
  canvas.center(y + 7, `Kills ${session.kills}  Gold ${session.gold}  Level ${session.level}`, "#8f9ba8")
  canvas.center(y + 9, "Enter rerun this seed    Esc title    q quit", "#66717d")
}

function drawDungeonBackdrop(canvas: Canvas, seed: number) {
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if ((x * 17 + y * 31 + seed) % 23 === 0) canvas.write(x, y, "·", "#1f3438")
      else if ((x * 7 + y * 13 + seed) % 61 === 0) canvas.write(x, y, "█", "#181c22")
    }
  }
}

function bar(label: string, value: number, max: number, width: number) {
  const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)))
  return `${label} ${"█".repeat(filled)}${"░".repeat(width - filled)} ${value}/${max}`
}

function runScore(session: GameSession) {
  return Math.max(0, session.floor * 100 + session.gold * 2 + session.kills * 25 + session.level * 50 - session.turn)
}

function trim(text: string, width: number) {
  return text.length <= width ? text : text.slice(0, Math.max(0, width - 1))
}

function fitPattern(text: string, width: number) {
  if (text.length === width) return text
  if (text.length > width) return text.slice(0, width)
  return text + " ".repeat(width - text.length)
}

function wrap(value: number, count: number) {
  return (value + count) % count
}
