import { activeAssetPack } from "../assets/packs.js"
import { actorAt, type GameSession, type HeroClass, type MultiplayerMode } from "../game/session.js"
import { Canvas } from "./canvas.js"

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

  const menuX = Math.max(4, Math.floor(canvas.width / 2) - 16)
  const menuY = Math.max(10, Math.floor(canvas.height / 2) - 4)
  startItems.forEach((item, index) => {
    const selected = model.menuIndex === index
    canvas.write(menuX, menuY + index * 2, `${selected ? ">" : " "} ${item}`, selected ? "#f4d06f" : "#d8dee9")
  })

  canvas.center(canvas.height - 4, "Enter select  ↑↓ navigate  ? help  q quit", "#66717d")
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

  canvas.center(canvas.height - 4, "Co-op and race are available as local modes; network hosting is next.", "#66717d")
}

function drawGame(canvas: Canvas, model: AppModel) {
  const session = model.session
  drawMap(canvas, session)
  drawHud(canvas, session)
  drawBottomLog(canvas, session)
}

function drawMap(canvas: Canvas, session: GameSession) {
  const tileWidth = 2
  const hudHeight = 3
  const logHeight = 5
  const viewWidth = Math.floor(canvas.width / tileWidth)
  const viewHeight = Math.max(6, canvas.height - hudHeight - logHeight)
  const startX = Math.max(0, session.player.x - Math.floor(viewWidth / 2))
  const startY = Math.max(0, session.player.y - Math.floor(viewHeight / 2))

  for (let sy = 0; sy < viewHeight; sy++) {
    for (let sx = 0; sx < viewWidth; sx++) {
      const x = startX + sx
      const y = startY + sy
      const actor = actorAt(session.dungeon.actors, { x, y })
      const style =
        session.player.x === x && session.player.y === y
          ? { glyph: "@@", fg: "#f4d06f" }
          : actor
            ? { glyph: activeAssetPack.actors[actor.kind].glyph.repeat(2), fg: activeAssetPack.actors[actor.kind].fg }
            : tileStyle(session, x, y)

      canvas.write(sx * tileWidth, hudHeight + sy, style.glyph, style.fg)
    }
  }
}

function tileStyle(session: GameSession, x: number, y: number) {
  const tile = session.dungeon.tiles[y]?.[x] ?? "void"
  if (tile === "floor") return { glyph: "··", fg: "#36595a" }
  if (tile === "wall") return { glyph: "██", fg: "#3b3f46" }
  if (tile === "stairs") return { glyph: ">>", fg: "#f4d06f" }
  if (tile === "potion") return { glyph: "!!", fg: "#d56b8c" }
  if (tile === "relic") return { glyph: "$$", fg: "#d6a85c" }
  if (tile === "chest") return { glyph: "[]", fg: "#c38b6a" }
  return { glyph: "  ", fg: "#05070a" }
}

function drawHud(canvas: Canvas, session: GameSession) {
  canvas.write(1, 0, `${session.hero.name} · ${session.hero.title}`, "#d8dee9")
  canvas.write(1, 1, bar("HP", session.hp, session.maxHp, 18), "#d56b8c")
  canvas.write(25, 1, bar("FOCUS", session.focus, session.maxFocus, 14), "#7dffb2")
  canvas.write(canvas.width - 33, 0, `Floor ${session.floor}  Seed ${session.seed}`, "#d6a85c")
  canvas.write(canvas.width - 33, 1, `Mode ${session.mode}  Art ${activeAssetPack.name}`, "#8f9ba8")
  const status = session.status === "running" ? `Turn ${session.turn}` : session.status.toUpperCase()
  canvas.write(canvas.width - 33, 2, status, session.status === "dead" ? "#d56b8c" : "#66717d")
  canvas.write(1, 2, "i inventory   h potion   r rest   ? help   esc pause", "#66717d")
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
    canvas.write(x + 3, y + 5, "Renderer: full terminal glyph surface", "#8f9ba8")
    canvas.write(x + 3, y + 7, "Later: swap glyph styles for @opentui/three sprites.", "#66717d")
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

function trim(text: string, width: number) {
  return text.length <= width ? text : text.slice(0, Math.max(0, width - 1))
}

function wrap(value: number, count: number) {
  return (value + count) % count
}
