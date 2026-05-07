import { activeAssetPack } from "../assets/packs.js"
import { d20FrameCount, d20RollSprite } from "../assets/d20Sprites.js"
import { pixelSprite, type PixelSprite, type PixelSpriteId } from "../assets/pixelSprites.js"
import {
  actorAt,
  combatSkills,
  combatTargets,
  pointKey,
  type GameSession,
  type HeroClass,
  type MultiplayerMode,
} from "../game/session.js"
import { saveDirectory, type SaveSummary } from "../game/saveStore.js"
import { Canvas } from "./canvas.js"

type TileRenderStyle = {
  fg: string
  bg?: string
  pattern: string[]
}

export type ScreenId = "start" | "character" | "mode" | "saves" | "cloud" | "game"
export type DialogId = "settings" | "inventory" | "help" | "log" | "pause" | null

export type DiceRollAnimation = {
  result: number
  startedAt: number
  durationMs: number
}

export type AppModel = {
  screen: ScreenId
  dialog: DialogId
  menuIndex: number
  classIndex: number
  modeIndex: number
  seed: number
  session: GameSession
  message: string
  saves: SaveSummary[]
  saveIndex: number
  saveStatus: string
  debugView: boolean
  rendererBackend: "terminal" | "three"
  diceRollAnimation?: DiceRollAnimation | null
}

const startItems = ["New descent", "Load save", "Character", "Multiplayer", "Cloud saves", "Settings", "Quit"]
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

const UI = {
  bg: "#05070a",
  ink: "#d8dee9",
  muted: "#66717d",
  soft: "#8f9ba8",
  panel: "#080c11",
  panel2: "#0e141c",
  panel3: "#131b25",
  edge: "#59616d",
  edgeDim: "#343b45",
  gold: "#f4d06f",
  brass: "#d6a85c",
  hp: "#d56b8c",
  hpBack: "#2b141f",
  focus: "#7dffb2",
  focusBack: "#123223",
  shadow: "#010203",
}

type QuickbarItem = {
  key: string
  label: string
  sprite?: PixelSpriteId
  custom?: "d20"
  count?: string
  active?: boolean
}

export function draw(model: AppModel, width: number, height: number) {
  const canvas = new Canvas(width, height, "#111820")

  if (model.screen === "start") drawStart(canvas, model)
  if (model.screen === "character") drawCharacter(canvas, model)
  if (model.screen === "mode") drawMode(canvas, model)
  if (model.screen === "saves") drawSaves(canvas, model)
  if (model.screen === "cloud") drawCloud(canvas, model)
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
  if (model.screen === "game") return
  if (model.screen === "saves") {
    model.saveIndex = wrap(model.saveIndex + delta, Math.max(1, model.saves.length))
    return
  }

  const count = model.screen === "character" ? classOptions.length : model.screen === "mode" ? modeOptions.length : startItems.length
  model.menuIndex = wrap(model.menuIndex + delta, count)
  if (model.screen === "character") model.classIndex = model.menuIndex
  if (model.screen === "mode") model.modeIndex = model.menuIndex
}

function drawStart(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed)
  const width = Math.min(100, canvas.width - 8)
  const height = Math.min(28, canvas.height - 6)
  const x = Math.floor((canvas.width - width) / 2)
  const y = Math.max(2, Math.floor((canvas.height - height) / 2))
  drawPanel(canvas, x, y, width, height, "opendungeon", UI.gold)
  drawPixelBlock(canvas, x + 5, y + 5, pixelSprite(classSprite(currentClass(model).id), 12, 6), 1)
  drawMiniIcon(canvas, x + 5, y + 14, "relic", 8, 3)
  drawMiniIcon(canvas, x + 16, y + 14, "coin", 8, 3)
  drawBrand(canvas, x + 22, y + 3, width - 28, UI.panel)
  canvas.write(x + 22, y + 8, trim("A dark fantasy roguelike for terminal crawls, cursed loot, and d20 trouble.", width - 28), UI.ink, UI.panel)
  canvas.write(x + 22, y + 10, `Hero ${currentClass(model).name}   Mode ${currentMode(model).name}   Seed ${model.seed}`, UI.brass, UI.panel)
  canvas.write(x + 22, y + 12, `Local saves ${model.saves.length}   Art ${activeAssetPack.name} by ${activeAssetPack.author}`, UI.soft, UI.panel)
  if (model.saveStatus && width >= 92) canvas.write(x + 22, y + 14, trim(model.saveStatus, width - 28), UI.focus, UI.panel)

  const menuX = x + Math.max(22, Math.floor(width * 0.52))
  const menuSpacing = height < 22 ? 1 : 2
  const menuY = Math.min(y + height - 3 - (startItems.length - 1) * menuSpacing, y + Math.max(12, Math.floor(height * 0.55)))
  startItems.forEach((item, index) => {
    const selected = model.menuIndex === index
    const row = menuY + index * menuSpacing
    if (selected) canvas.fill(menuX - 2, row, Math.min(26, width - (menuX - x) - 4), 1, " ", UI.panel3, UI.panel3)
    canvas.write(menuX, row, `${selected ? ">" : " "} ${item}`, selected ? UI.gold : UI.ink, selected ? UI.panel3 : UI.panel)
  })

  canvas.center(canvas.height - 3, "Enter select  ↑↓ navigate  n new seed  ? help  q quit", UI.muted)
}

function drawCharacter(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 2)
  const width = Math.min(90, canvas.width - 8)
  const height = Math.min(22, canvas.height - 6)
  const x = Math.floor((canvas.width - width) / 2)
  const y = Math.max(2, Math.floor((canvas.height - height) / 2))
  drawPanel(canvas, x, y, width, height, "Choose Your Crawler", UI.gold)

  classOptions.forEach((option, index) => {
    const selected = model.classIndex === index
    const row = y + 4 + index * 5
    const sprite: PixelSpriteId = option.id === "arcanist" ? "necromancer" : option.id === "warden" ? "ghoul" : "hero"
    canvas.fill(x + 3, row - 1, width - 6, 4, " ", selected ? UI.panel3 : UI.panel2, selected ? UI.panel3 : UI.panel2)
    canvas.border(x + 3, row - 1, width - 6, 4, selected ? UI.gold : UI.edgeDim)
    drawPixelBlock(canvas, x + 6, row, pixelSprite(sprite, 8, 3), selected ? 1 : 0.5)
    canvas.write(x + 17, row, `${selected ? ">" : " "} ${option.name}`, selected ? UI.gold : UI.ink, selected ? UI.panel3 : UI.panel2)
    canvas.write(x + 21, row + 1, option.text, selected ? UI.ink : UI.soft, selected ? UI.panel3 : UI.panel2)
  })

  canvas.center(canvas.height - 3, "Enter confirm  Esc title", UI.muted)
}

function drawMode(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 4)
  const width = Math.min(86, canvas.width - 8)
  const height = Math.min(22, canvas.height - 6)
  const x = Math.floor((canvas.width - width) / 2)
  const y = Math.max(2, Math.floor((canvas.height - height) / 2))
  drawPanel(canvas, x, y, width, height, "Run Mode", UI.gold)
  drawD20Sprite(canvas, x + 5, y + 4, 20, d20FrameCount() - 1, 10, 5)

  modeOptions.forEach((option, index) => {
    const selected = model.modeIndex === index
    const row = y + 4 + index * 4
    const rowX = x + 18
    if (selected) canvas.fill(rowX - 2, row, width - 24, 2, " ", UI.panel3, UI.panel3)
    canvas.write(rowX, row, `${selected ? ">" : " "} ${option.name}`, selected ? UI.gold : UI.ink, selected ? UI.panel3 : UI.panel)
    canvas.write(rowX + 4, row + 1, option.text, selected ? UI.ink : UI.soft, selected ? UI.panel3 : UI.panel)
  })

  canvas.write(x + 4, y + height - 4, `Host lobby: bun run host -- --mode ${currentMode(model).id} --seed ${model.seed}`, UI.soft, UI.panel)
  canvas.write(x + 4, y + height - 3, "Friends reuse the shared seed for co-op or race runs.", UI.muted, UI.panel)
}

function drawSaves(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 8)
  const width = Math.min(108, canvas.width - 8)
  const height = Math.min(30, canvas.height - 6)
  const x = Math.floor((canvas.width - width) / 2)
  const y = Math.max(2, Math.floor((canvas.height - height) / 2))
  drawPanel(canvas, x, y, width, height, "Load Save", UI.gold)
  drawBrand(canvas, x + 4, y + 3, Math.min(width - 8, 58), UI.panel)

  const listX = x + 4
  const listY = y + 9
  const listW = Math.min(48, Math.max(32, Math.floor(width * 0.45)))
  const rows = Math.max(1, Math.floor((height - 14) / 3))
  const offset = scrollOffset(model.saveIndex, rows, model.saves.length)

  canvas.write(listX, listY - 2, "LOCAL RUNS", UI.brass, UI.panel)
  canvas.write(listX + 17, listY - 2, trim(saveDirectory(), listW - 17), UI.muted, UI.panel)

  if (!model.saves.length) {
    canvas.fill(listX, listY, listW, 6, " ", UI.panel2, UI.panel2)
    canvas.border(listX, listY, listW, 6, UI.edgeDim)
    drawMiniIcon(canvas, listX + 3, listY + 2, "scroll", 8, 2)
    canvas.write(listX + 14, listY + 2, "No local saves yet.", UI.ink, UI.panel2)
    canvas.write(listX + 14, listY + 3, "Start a run, then press Ctrl+S or F5.", UI.soft, UI.panel2)
  } else {
    model.saves.slice(offset, offset + rows).forEach((save, visibleIndex) => {
      const index = offset + visibleIndex
      const selected = index === model.saveIndex
      const rowY = listY + visibleIndex * 3
      canvas.fill(listX, rowY, listW, 2, " ", selected ? UI.panel3 : UI.panel2, selected ? UI.panel3 : UI.panel2)
      canvas.border(listX, rowY, listW, 3, selected ? UI.gold : UI.edgeDim)
      drawMiniIcon(canvas, listX + 2, rowY + 1, classSprite(save.classId as HeroClass), 5, 1, selected ? 1 : 0.65)
      canvas.write(listX + 9, rowY + 1, trim(`${selected ? ">" : " "} ${save.heroName} F${save.floor}/${save.finalFloor}`, listW - 24), selected ? UI.gold : UI.ink, selected ? UI.panel3 : UI.panel2)
      canvas.write(listX + listW - 13, rowY + 1, `LV ${save.level}`, UI.brass, selected ? UI.panel3 : UI.panel2)
      canvas.write(listX + 9, rowY + 2, trim(formatSaveTime(save.savedAt), listW - 13), UI.muted, selected ? UI.panel3 : UI.panel2)
      canvas.write(listX + listW - 11, rowY + 2, save.status, statusColor(save.status), selected ? UI.panel3 : UI.panel2)
    })
  }

  const detailX = listX + listW + 4
  const detailW = Math.max(28, width - (detailX - x) - 4)
  const detailHeight = Math.max(9, height - 11)
  const selected = model.saves[model.saveIndex]
  drawPanel(canvas, detailX, listY - 3, detailW, detailHeight, "Save Detail", selected ? UI.gold : UI.edge)

  if (selected) {
    drawPixelBlock(canvas, detailX + 3, listY, pixelSprite(classSprite(selected.classId as HeroClass), 10, 5), 1)
    canvas.write(detailX + 16, listY, trim(selected.heroName, detailW - 19), UI.ink, UI.panel)
    canvas.write(detailX + 16, listY + 1, trim(selected.heroTitle, detailW - 19), UI.soft, UI.panel)
    canvas.write(detailX + 16, listY + 3, `Floor ${selected.floor}/${selected.finalFloor}   Turn ${selected.turn}`, UI.gold, UI.panel)
    canvas.write(detailX + 16, listY + 4, `Mode ${selected.mode}   Seed ${selected.seed}`, UI.brass, UI.panel)

    if (detailHeight > 10) drawSettingRow(canvas, detailX + 3, listY + 7, detailW - 6, "Level", String(selected.level))
    if (detailHeight > 12) drawSettingRow(canvas, detailX + 3, listY + 9, detailW - 6, "Gold", String(selected.gold))
    if (detailHeight > 14) drawSettingRow(canvas, detailX + 3, listY + 11, detailW - 6, "Saved", formatSaveTime(selected.savedAt))
    if (detailHeight > 16) drawSettingRow(canvas, detailX + 3, listY + 13, detailW - 6, "File", selected.path)
  } else {
    canvas.write(detailX + 4, listY, "Local saves are stored per computer.", UI.ink, UI.panel)
    canvas.write(detailX + 4, listY + 2, "Cloud sync is planned as a separate adapter,", UI.soft, UI.panel)
    canvas.write(detailX + 4, listY + 3, "so the local format stays useful offline.", UI.soft, UI.panel)
  }

  canvas.center(canvas.height - 3, "Enter load  ↑↓ choose save  r refresh  Esc title", UI.muted)
}

function drawCloud(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 12)
  const width = Math.min(100, canvas.width - 8)
  const height = Math.min(27, canvas.height - 6)
  const x = Math.floor((canvas.width - width) / 2)
  const y = Math.max(2, Math.floor((canvas.height - height) / 2))
  drawPanel(canvas, x, y, width, height, "Cloud Saves", UI.gold)
  drawBrand(canvas, x + 4, y + 3, Math.min(width - 8, 58), UI.panel)

  const leftX = x + 4
  const rowY = y + 10
  canvas.write(leftX, rowY - 2, "SYNC PLAN", UI.brass, UI.panel)
  const rows = [
    ["Provider", "GitHub account login with device auth."],
    ["Storage", "Private Gist or private repo branch containing save envelopes."],
    ["Offline", "Local saves remain the source of truth when disconnected."],
    ["Conflict", "Manual saves keep history; newest autosave wins only autosave."],
    ["Security", "Encrypt save payloads before upload once accounts ship."],
    ["Prototype", "OPENDUNGEON_GITHUB_TOKEN can power CLI-only sync later."],
  ]

  rows.slice(0, Math.max(2, Math.floor((height - 13) / 2))).forEach((row, index) => {
    drawSettingRow(canvas, leftX, rowY + index * 2, width - 8, row[0], row[1])
  })

  const noteY = y + height - 6
  canvas.write(leftX, noteY, "This screen is intentionally separate from local save/load.", UI.ink, UI.panel)
  canvas.write(leftX, noteY + 1, "The next code step is a CloudSaveAdapter using the same JSON envelope.", UI.soft, UI.panel)
  canvas.write(leftX, noteY + 2, `Local save path: ${trim(saveDirectory(), width - 25)}`, UI.muted, UI.panel)
  canvas.center(canvas.height - 3, "Esc title", UI.muted)
}

function drawGame(canvas: Canvas, model: AppModel) {
  const session = model.session
  drawMap(canvas, session, model.debugView)
  drawHud(canvas, session)
  if (!model.debugView) drawQuickbar(canvas, session, model.diceRollAnimation)
  if (session.combat.active) drawCombatPanel(canvas, session, model.diceRollAnimation)
  if (session.status !== "running") drawRunEnd(canvas, session)
}

function drawMap(canvas: Canvas, session: GameSession, debugView: boolean) {
  const tileWidth = debugView ? 2 : 8
  const tileHeight = debugView ? 1 : 4
  const hudHeight = debugView ? 4 : gameHudHeight(canvas)
  const bottomHudHeight = debugView ? 0 : gameQuickbarHeight(canvas)
  const viewWidth = Math.floor(canvas.width / tileWidth)
  const viewHeight = Math.max(4, Math.floor((canvas.height - hudHeight - bottomHudHeight) / tileHeight))
  const startX = session.player.x - Math.floor(viewWidth / 2)
  const startY = session.player.y - Math.floor(viewHeight / 2)
  const targets = combatTargets(session)
  const selectedTargetId = session.combat.active ? targets[session.combat.selectedTarget]?.id : undefined

  for (let sy = 0; sy < viewHeight; sy++) {
    for (let sx = 0; sx < viewWidth; sx++) {
      const x = startX + sx
      const y = startY + sy
      const point = { x, y }
      const visible = session.visible.has(pointKey(point))
      const seen = session.seen.has(pointKey(point))
      const actor = visible ? actorAt(session.dungeon.actors, point) : undefined
      const screenX = sx * tileWidth
      const screenY = hudHeight + sy * tileHeight

      if (debugView) {
        const style = tileStyle(session, x, y, true, visible, seen)
        drawTileBlock(canvas, screenX, screenY, tileWidth, tileHeight, style)
      } else {
        drawAssetTile(canvas, screenX, screenY, tileWidth, tileHeight, session, x, y, visible, seen)
      }

      if (session.player.x === x && session.player.y === y) drawSprite(canvas, screenX, screenY, tileWidth, tileHeight, "hero", debugView)
      else if (actor) {
        drawSprite(canvas, screenX, screenY, tileWidth, tileHeight, actor.kind, debugView)
        if (actor.id === selectedTargetId) drawTargetFrame(canvas, screenX, screenY, tileWidth, tileHeight, debugView)
      }
    }
  }
}

function drawAssetTile(
  canvas: Canvas,
  screenX: number,
  screenY: number,
  tileWidth: number,
  tileHeight: number,
  session: GameSession,
  x: number,
  y: number,
  visible: boolean,
  seen: boolean,
) {
  const tile = session.dungeon.tiles[y]?.[x] ?? "void"
  if (!seen || tile === "void") {
    canvas.fill(screenX, screenY, tileWidth, tileHeight, " ", "#05070a", "#05070a")
    return
  }

  const dim = visible ? 1 : 0.42
  if (tile === "wall") {
    drawPixelBlock(canvas, screenX, screenY, pixelSprite((x + y) % 2 === 0 ? "wall-a" : "wall-b", tileWidth, tileHeight), dim)
    return
  }

  drawPixelBlock(canvas, screenX, screenY, floorSprite(x, y, tileWidth, tileHeight), dim)
  if (!visible) return
  if (tile === "stairs") drawPixelBlock(canvas, screenX, screenY, pixelSprite("stairs", tileWidth, tileHeight), 1)
  if (tile === "potion") drawPixelBlock(canvas, screenX, screenY, pixelSprite("potion", tileWidth, tileHeight), 1)
  if (tile === "relic") drawPixelBlock(canvas, screenX, screenY, pixelSprite("relic", tileWidth, tileHeight), 1)
  if (tile === "chest") drawPixelBlock(canvas, screenX, screenY, pixelSprite("chest", tileWidth, tileHeight), 1)
}

function tileStyle(session: GameSession, x: number, y: number, debugView: boolean, visible: boolean, seen: boolean): TileRenderStyle {
  const tile = session.dungeon.tiles[y]?.[x] ?? "void"
  if (debugView) return debugTileStyle(session, x, y)
  if (!seen) return { pattern: ["        ", "        ", "        ", "        "], fg: "#05070a", bg: "#05070a" }
  if (tile === "floor") return floorStyle(x, y, visible)
  if (tile === "wall") return wallStyle(x, y, visible)
  if (tile === "stairs") return visible ? { pattern: ["        ", "  /==\\  ", "  |  |  ", "  \\==/  "], fg: "#2d1d17", bg: "#b4915a" } : floorStyle(x, y, false)
  if (tile === "potion") return visible ? { pattern: ["        ", "        ", "   ●    ", "        "], fg: "#f4a6b8", bg: textureColor(x, y) } : floorStyle(x, y, false)
  if (tile === "relic") return visible ? { pattern: ["        ", "        ", "   ◆    ", "        "], fg: "#f4d06f", bg: textureColor(x, y) } : floorStyle(x, y, false)
  if (tile === "chest") return visible ? { pattern: ["        ", "        ", "  [▤]   ", "        "], fg: "#f4d06f", bg: "#9a6c4e" } : floorStyle(x, y, false)
  return { pattern: ["        ", "        ", "        ", "        "], fg: "#05070a", bg: "#05070a" }
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

  const spriteId = sprite === "hero" || sprite === "player" ? "hero" : sprite
  drawPixelBlock(canvas, x, y, pixelSprite(spriteId, width, height), 1)
}

function drawPixelBlock(canvas: Canvas, x: number, y: number, sprite: PixelSprite, dim = 1) {
  for (let row = 0; row < sprite.height; row++) {
    for (let col = 0; col < sprite.width; col++) {
      const cell = sprite.cells[row][col]
      if (cell.ch === " " && !cell.bg) continue
      canvas.write(x + col, y + row, cell.ch, tint(cell.fg, dim), cell.bg ? tint(cell.bg, dim) : undefined)
    }
  }
}

function floorSprite(x: number, y: number, width: number, height: number) {
  const variant = (x * 7 + y * 11) % 3
  if (variant === 0) return pixelSprite("floor-a", width, height)
  if (variant === 1) return pixelSprite("floor-b", width, height)
  return pixelSprite("floor-c", width, height)
}

function drawTargetFrame(canvas: Canvas, x: number, y: number, width: number, height: number, debugView: boolean) {
  if (debugView) {
    canvas.write(x, y, "[]", "#f4d06f")
    return
  }
  canvas.border(x, y, width, height, "#f4d06f")
}

function floorStyle(x: number, y: number, visible: boolean): TileRenderStyle {
  const bg = visible ? textureColor(x, y) : dimTextureColor(x, y)
  const fg = visible ? "#5b7f7a" : "#253a3b"
  const n = (x * 5 + y * 9) % 4
  if (n === 0) return { pattern: ["        ", "   ░    ", "        ", "      ░ "], fg, bg }
  if (n === 1) return { pattern: ["     ░  ", "        ", "  ░     ", "        "], fg, bg }
  if (n === 2) return { pattern: ["        ", " ░      ", "        ", "    ░   "], fg, bg }
  return { pattern: ["        ", "        ", "      ░ ", " ░      "], fg, bg }
}

function wallStyle(x: number, y: number, visible: boolean): TileRenderStyle {
  const bg = visible ? stoneColor(x, y) : "#171a1f"
  const fg = visible ? "#777f8b" : "#282e36"
  return { pattern: ["▛▀▀▀▀▀▜", "▌ ▗▄▄▖ ▐", "▌ ▝▀▀▘ ▐", "▙▄▄▄▄▄▟"], fg, bg }
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
  const height = gameHudHeight(canvas)
  canvas.fill(0, 0, canvas.width, height, " ", UI.bg, UI.bg)

  if (canvas.width < 96 || height < 6) {
    const hero = trim(`${session.hero.name} · ${session.hero.title}`, Math.max(16, canvas.width - 34))
    canvas.write(1, 0, hero, UI.ink)
    writeRight(canvas, 0, `F${session.floor}/${session.finalFloor}  Seed ${session.seed}`, UI.brass)
    drawHudBar(canvas, 1, 1, Math.max(12, Math.floor(canvas.width * 0.32)), "HP", session.hp, session.maxHp, UI.hp, UI.hpBack)
    drawHudBar(canvas, Math.floor(canvas.width * 0.43), 1, Math.max(10, Math.floor(canvas.width * 0.25)), "FOCUS", session.focus, session.maxFocus, UI.focus, UI.focusBack)
    canvas.write(1, 3, compactControls(session), UI.muted)
    return
  }

  const leftW = Math.min(54, Math.max(38, Math.floor(canvas.width * 0.28)))
  const rightW = Math.min(48, Math.max(34, Math.floor(canvas.width * 0.22)))
  const centerX = leftW + 2
  const centerW = Math.max(38, canvas.width - leftW - rightW - 4)
  const rightX = canvas.width - rightW - 1

  drawPanel(canvas, 1, 0, leftW, height, "Crawler", UI.brass)
  drawPixelBlock(canvas, 3, 2, pixelSprite(classSprite(session.hero.classId), 8, 4), 1)
  canvas.write(13, 2, trim(session.hero.name, leftW - 16), UI.ink, UI.panel)
  canvas.write(13, 3, trim(session.hero.title, leftW - 16), UI.soft, UI.panel)
  canvas.write(13, 5, `LV ${session.level}   XP ${session.xp}/${session.level * 10}`, UI.gold, UI.panel)

  drawPanel(canvas, centerX, 0, centerW, height, "Vitals", UI.edge)
  drawHudBar(canvas, centerX + 3, 2, Math.max(16, Math.floor(centerW * 0.46)), "HP", session.hp, session.maxHp, UI.hp, UI.hpBack)
  drawHudBar(canvas, centerX + Math.floor(centerW * 0.52), 2, Math.max(14, Math.floor(centerW * 0.39)), "FOCUS", session.focus, session.maxFocus, UI.focus, UI.focusBack)
  canvas.write(centerX + 3, 4, trim(compactControls(session), centerW - 6), UI.muted, UI.panel)
  if (session.combat.active) canvas.write(centerX + 3, 5, "Initiative: target with Tab, choose a skill, roll the d20.", UI.gold, UI.panel)
  else canvas.write(centerX + 3, 5, trim(session.log[0] ?? "The dungeon waits.", centerW - 6), UI.soft, UI.panel)

  drawPanel(canvas, rightX, 0, rightW, height, "Run", UI.brass)
  canvas.write(rightX + 3, 2, `Floor ${session.floor}/${session.finalFloor}`, UI.gold, UI.panel)
  canvas.write(rightX + 18, 2, `Seed ${session.seed}`, UI.brass, UI.panel)
  canvas.write(rightX + 3, 3, `Mode ${session.mode}`, UI.soft, UI.panel)
  canvas.write(rightX + 18, 3, `Art ${activeAssetPack.name}`, UI.soft, UI.panel)
  canvas.write(rightX + 3, 5, `Turn ${session.turn}`, session.status === "dead" ? UI.hp : UI.muted, UI.panel)
  drawMiniIcon(canvas, rightX + rightW - 12, 4, "coin", 6, 2)
  canvas.write(rightX + rightW - 6, 5, String(session.gold), UI.gold, UI.panel)
}

function drawQuickbar(canvas: Canvas, session: GameSession, animation?: DiceRollAnimation | null) {
  const height = gameQuickbarHeight(canvas)
  if (!height) return
  const slotCount = 6
  const slotWidth = 13
  const width = slotCount * slotWidth + 4
  const x = Math.max(2, Math.floor((canvas.width - width) / 2))
  const y = canvas.height - height
  const items: QuickbarItem[] = [
    { key: "1", label: "Strike", sprite: "sword", active: session.combat.active && session.combat.selectedSkill === 0 },
    {
      key: "H",
      label: "Potion",
      sprite: "potion",
      count: String(countInventory(session, "Deploy nerve potion")),
      active: session.combat.active && session.hp < session.maxHp,
    },
    { key: "G", label: "Gold", sprite: "coin", count: String(session.gold) },
    { key: "R", label: "Relic", sprite: "relic", count: String(countInventory(session, "Missing env var")) },
    { key: "D", label: "Roll", custom: "d20", active: session.combat.active },
    { key: "I", label: "Pack", sprite: "scroll", count: String(session.inventory.length) },
  ]

  drawPanel(canvas, x, y, width, height - 1, session.combat.active ? "Action Bar" : "Pack", session.combat.active ? UI.gold : UI.edge)
  items.forEach((item, index) => {
    const slotX = x + 2 + index * slotWidth
    const edge = item.active ? UI.gold : UI.edge
    canvas.fill(slotX + 1, y + 2, slotWidth - 3, height - 4, " ", UI.panel2, UI.panel2)
    canvas.border(slotX, y + 1, slotWidth - 1, height - 2, edge)
    canvas.write(slotX + 1, y + 1, item.key, item.active ? UI.gold : UI.muted, UI.panel2)
    if (item.custom === "d20") drawD20Sprite(canvas, slotX + 2, y + 2, diceResult(session, animation), diceFrame(session, animation), 8, 3, item.active, animation)
    else if (item.sprite) drawMiniIcon(canvas, slotX + 3, y + 2, item.sprite, 7, 3)
    canvas.write(slotX + 1, y + height - 3, trim(item.label, slotWidth - 3), item.active ? UI.gold : UI.soft, UI.panel2)
    if (item.count !== undefined && item.count !== "0") {
      const count = trim(item.count, 3)
      canvas.write(slotX + slotWidth - count.length - 2, y + 1, count, UI.gold, UI.panel2)
    }
  })
}

function drawCombatPanel(canvas: Canvas, session: GameSession, animation?: DiceRollAnimation | null) {
  const width = Math.min(58, Math.max(38, Math.floor(canvas.width * 0.35)))
  const height = Math.min(18, Math.max(14, canvas.height - gameHudHeight(canvas) - gameQuickbarHeight(canvas) - 2))
  const x = Math.max(1, canvas.width - width - 2)
  const y = Math.max(gameHudHeight(canvas) + 1, canvas.height - gameQuickbarHeight(canvas) - height - 1)
  const targets = combatTargets(session)
  const selectedSkill = combatSkills[session.combat.selectedSkill]
  const roll = session.combat.lastRoll

  drawPanel(canvas, x, y, width, height, "Turn Combat", UI.gold)
  drawD20Sprite(canvas, x + width - 11, y + 1, diceResult(session, animation), diceFrame(session, animation), 8, 3, true, animation)

  canvas.write(x + 2, y + 3, "Targets", UI.brass, UI.panel)
  targets.slice(0, 4).forEach((target, index) => {
    const selected = index === session.combat.selectedTarget
    const text = `${selected ? ">" : " "} ${label(target.kind)} HP ${target.hp}`
    const row = y + 4 + index
    if (selected) canvas.fill(x + 2, row, Math.floor(width / 2) - 4, 1, " ", UI.panel3, UI.panel3)
    drawMiniIcon(canvas, x + 3, row, actorSpriteId(target.kind), 4, 1)
    canvas.write(x + 8, row, trim(text, Math.floor(width / 2) - 9), selected ? UI.gold : UI.ink, selected ? UI.panel3 : UI.panel)
  })

  const skillX = x + Math.floor(width / 2)
  canvas.write(skillX, y + 3, "Skills", UI.brass, UI.panel)
  combatSkills.forEach((skill, index) => {
    const selected = index === session.combat.selectedSkill
    const unavailable = session.focus < skill.cost
    const text = `${index + 1} ${skill.name} F${skill.cost}`
    const row = y + 4 + index
    if (selected) canvas.fill(skillX, row, width - (skillX - x) - 2, 1, " ", UI.panel3, UI.panel3)
    canvas.write(skillX + 1, row, trim(text, width - (skillX - x) - 4), unavailable ? UI.muted : selected ? UI.focus : UI.ink, selected ? UI.panel3 : UI.panel)
  })

  canvas.fill(x + 2, y + height - 7, width - 4, 3, " ", UI.panel2, UI.panel2)
  canvas.write(x + 3, y + height - 7, trim(selectedSkill.text, width - 6), UI.soft, UI.panel2)
  canvas.write(x + 3, y + height - 6, trim(session.combat.message, width - 6), UI.ink, UI.panel2)

  const diceX = x + width - 15
  const diceY = y + height - 5
  canvas.border(diceX, diceY, 12, 4, roll?.hit ? UI.focus : UI.hp)
  drawD20Sprite(canvas, diceX + 1, diceY + 1, diceResult(session, animation), diceFrame(session, animation), 5, 2, true, animation)
  canvas.write(diceX + 7, diceY + 1, roll ? String(roll.d20).padStart(2, "0") : "d20", roll?.hit ? UI.focus : UI.gold)
  canvas.write(diceX + 2, diceY + 2, roll ? `${roll.total}/${roll.dc}` : "roll", UI.ink)

  const footer = roll ? `${roll.skill} ${roll.hit ? "hit" : "miss"} ${roll.target}` : "Enter rolls selected skill"
  canvas.write(x + 2, y + height - 2, trim(footer, width - 4), UI.muted, UI.panel)
}

function gameHudHeight(canvas: Canvas) {
  return canvas.height < 28 ? 4 : 7
}

function gameQuickbarHeight(canvas: Canvas) {
  return canvas.height < 30 || canvas.width < 90 ? 0 : 8
}

function drawPanel(canvas: Canvas, x: number, y: number, width: number, height: number, title: string, accent = UI.edge) {
  canvas.fill(x + 2, y + 1, width, height, " ", UI.shadow, UI.shadow)
  canvas.fill(x, y, width, height, " ", UI.panel, UI.panel)
  canvas.border(x, y, width, height, accent)
  if (height > 3) {
    canvas.fill(x + 1, y + 1, width - 2, 1, " ", UI.panel2, UI.panel2)
    canvas.write(x + 2, y + 1, trim(title, width - 4), accent, UI.panel2)
  }
}

function drawBrand(canvas: Canvas, x: number, y: number, width: number, bg = UI.panel) {
  const wideLogo = [
    "  ___  ___  ___ _  _ ___  _   _ _  _  ___ ___ ___  _  _ ",
    " / _ \\| _ \\| __| \\| |   \\| | | | \\| |/ __| __/ _ \\| \\| |",
    "| (_) |  _/| _|| .` | |) | |_| | .` | (_ | _| (_) | .` |",
    " \\___/|_|  |___|_|\\_|___/ \\___/|_|\\_|\\___|___\\___/|_|\\_|",
  ]
  if (width >= 62) {
    wideLogo.forEach((line, index) => canvas.write(x, y + index, trim(line, width), index === 0 ? UI.brass : UI.gold, bg))
    return
  }

  canvas.write(x, y, trim("O P E N D U N G E O N", width), UI.gold, bg)
  if (width > 24) canvas.write(x, y + 1, trim("terminal dungeon crawler", width), UI.soft, bg)
}

function drawHudBar(
  canvas: Canvas,
  x: number,
  y: number,
  width: number,
  labelText: string,
  value: number,
  max: number,
  color: string,
  back: string,
) {
  const stat = `${value}/${max}`
  const barWidth = Math.max(4, width - labelText.length - stat.length - 3)
  const filled = Math.max(0, Math.min(barWidth, Math.round((value / max) * barWidth)))
  canvas.write(x, y, labelText, color, UI.panel)
  canvas.fill(x + labelText.length + 1, y, barWidth, 1, " ", back, back)
  canvas.fill(x + labelText.length + 1, y, filled, 1, " ", color, color)
  canvas.write(x + labelText.length + barWidth + 2, y, stat, color, UI.panel)
}

function drawMiniIcon(canvas: Canvas, x: number, y: number, sprite: PixelSpriteId, width = 6, height = 2, dim = 1) {
  drawPixelBlock(canvas, x, y, pixelSprite(sprite, width, height), dim)
}

function drawD20Sprite(
  canvas: Canvas,
  x: number,
  y: number,
  result: number,
  frame: number,
  width = 10,
  height = 5,
  moving = false,
  animation?: DiceRollAnimation | null,
) {
  const shake = moving && animation ? diceShake(frame) : { x: 0, y: 0 }
  drawPixelBlock(canvas, x + shake.x, y + shake.y, d20RollSprite(result, frame, width, height), 1)
}

function diceResult(session: GameSession, animation?: DiceRollAnimation | null) {
  return animation?.result ?? session.combat.lastRoll?.d20 ?? 20
}

function diceFrame(_session: GameSession, animation?: DiceRollAnimation | null) {
  if (!animation) return d20FrameCount() - 1
  const elapsed = Date.now() - animation.startedAt
  const progress = clamp(elapsed / animation.durationMs, 0, 1)
  return clamp(Math.floor(progress * d20FrameCount()), 0, d20FrameCount() - 1)
}

function diceShake(frame: number) {
  const pattern = [
    { x: -1, y: 0 },
    { x: 1, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
  ]
  return pattern[frame % pattern.length]
}

function drawDialogFrame(
  canvas: Canvas,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  icon: PixelSpriteId | "d20",
) {
  canvas.fill(x + 2, y + 1, width, height, " ", UI.shadow, UI.shadow)
  canvas.fill(x, y, width, height, " ", UI.panel, UI.panel)
  canvas.border(x, y, width, height, UI.gold)
  canvas.fill(x + 1, y + 1, width - 2, 2, " ", UI.panel2, UI.panel2)
  canvas.write(x + 4, y + 1, title.toUpperCase(), UI.gold, UI.panel2)
  if (icon === "d20") drawD20Sprite(canvas, x + width - 12, y + 1, 20, d20FrameCount() - 1, 9, 3)
  else drawMiniIcon(canvas, x + width - 12, y + 1, icon, 7, 2)
}

function dialogTitle(dialog: NonNullable<DialogId>) {
  if (dialog === "settings") return "Settings"
  if (dialog === "inventory") return "Inventory"
  if (dialog === "help") return "Controls"
  if (dialog === "log") return "Run Log"
  return "Paused"
}

function dialogIcon(dialog: NonNullable<DialogId>): PixelSpriteId | "d20" {
  if (dialog === "settings") return "focus-gem"
  if (dialog === "inventory") return "scroll"
  if (dialog === "help") return "sword"
  if (dialog === "log") return "coin"
  return "d20"
}

function drawSettingRow(canvas: Canvas, x: number, y: number, width: number, labelText: string, value: string) {
  canvas.fill(x, y, width, 1, " ", UI.panel2, UI.panel2)
  canvas.write(x + 2, y, trim(labelText, 12), UI.brass, UI.panel2)
  canvas.write(x + 16, y, trim(value, width - 18), UI.ink, UI.panel2)
}

function drawKeycap(canvas: Canvas, x: number, y: number, text: string) {
  const key = trim(text, 9)
  const width = Math.max(5, key.length + 4)
  canvas.fill(x, y, width, 1, " ", UI.panel3, UI.panel3)
  canvas.write(x, y, `[ ${key} ]`, UI.gold, UI.panel3)
}

function inventoryRows(session: GameSession) {
  const counts = new Map<string, number>()
  for (const item of session.inventory) counts.set(item, (counts.get(item) ?? 0) + 1)
  return [...counts.entries()].map(([name, count]) => ({ name, count, sprite: inventorySprite(name) }))
}

function inventorySprite(name: string): PixelSpriteId {
  const lower = name.toLowerCase()
  if (lower.includes("potion") || lower.includes("vial")) return "potion"
  if (lower.includes("blade") || lower.includes("sword")) return "sword"
  if (lower.includes("scroll") || lower.includes("rollback")) return "scroll"
  if (lower.includes("env") || lower.includes("idol") || lower.includes("relic")) return "relic"
  return "chest"
}

function countInventory(session: GameSession, name: string) {
  return session.inventory.filter((item) => item === name).length
}

function classSprite(classId: HeroClass): PixelSpriteId {
  if (classId === "arcanist") return "necromancer"
  if (classId === "warden") return "ghoul"
  return "hero"
}

function actorSpriteId(kind: string): PixelSpriteId {
  if (kind === "ghoul") return "ghoul"
  if (kind === "necromancer") return "necromancer"
  return "slime"
}

function compactControls(session: GameSession) {
  return session.combat.active
    ? "Tab target   1-3 skill   Enter roll   H potion   Ctrl+S save"
    : "I inventory   L log   H potion   R rest   Ctrl+S save   Esc pause"
}

function writeRight(canvas: Canvas, y: number, text: string, color: string) {
  canvas.write(Math.max(1, canvas.width - text.length - 2), y, text, color)
}

function drawDialog(canvas: Canvas, model: AppModel) {
  if (!model.dialog) return
  const wide = model.dialog === "inventory" || model.dialog === "log" || model.dialog === "settings"
  const width = Math.min(wide ? 88 : 74, canvas.width - 10)
  const height = model.dialog === "inventory" || model.dialog === "log" ? 18 : model.dialog === "settings" ? 18 : model.dialog === "help" ? 18 : 14
  const x = Math.floor((canvas.width - width) / 2)
  const y = Math.floor((canvas.height - height) / 2)
  drawDialogFrame(canvas, x, y, width, height, dialogTitle(model.dialog), dialogIcon(model.dialog))

  if (model.dialog === "settings") {
    drawSettingRow(canvas, x + 4, y + 4, width - 8, "Seed", String(model.seed))
    drawSettingRow(canvas, x + 4, y + 6, width - 8, "Renderer", model.rendererBackend === "three" ? "@opentui/three asset backend" : "0x72 terminal sprites")
    drawSettingRow(canvas, x + 4, y + 8, width - 8, "Debug", model.debugView ? "on via OPENDUNGEON_DEBUG_VIEW=1" : "off")
    drawSettingRow(canvas, x + 4, y + 10, width - 8, "Save path", saveDirectory())
    drawSettingRow(canvas, x + 4, y + 12, width - 8, "Cloud", "planned GitHub login + encrypted save sync")
    drawSettingRow(canvas, x + 4, y + 14, width - 8, "Host", `bun run host -- --mode race --seed ${model.seed}`)
  }

  if (model.dialog === "inventory") {
    const rows = inventoryRows(model.session)
    const gridX = x + 4
    const gridY = y + 4
    rows.slice(0, 8).forEach((row, index) => {
      const cardX = gridX + (index % 2) * Math.floor((width - 10) / 2)
      const cardY = gridY + Math.floor(index / 2) * 3
      const cardW = Math.floor((width - 12) / 2)
      canvas.fill(cardX, cardY, cardW, 2, " ", UI.panel2, UI.panel2)
      canvas.border(cardX, cardY, cardW, 3, UI.edgeDim)
      drawMiniIcon(canvas, cardX + 2, cardY + 1, row.sprite, 6, 1)
      canvas.write(cardX + 9, cardY + 1, trim(row.name, cardW - 15), UI.ink, UI.panel2)
      canvas.write(cardX + cardW - 5, cardY + 1, `x${row.count}`, UI.gold, UI.panel2)
    })
    if (!rows.length) canvas.center(y + Math.floor(height / 2), "Your pack is empty.", UI.soft, UI.panel)
    canvas.write(x + 4, y + height - 4, "Loot is run-scoped now; multiplayer trading will reuse this inventory grid.", UI.muted, UI.panel)
  }

  if (model.dialog === "log") {
    model.session.log.slice(0, 10).forEach((line, index) => {
      const rowY = y + 4 + index
      const color = index === 0 ? UI.gold : index < 3 ? UI.ink : UI.soft
      canvas.write(x + 4, rowY, String(index + 1).padStart(2, "0"), UI.muted, UI.panel)
      canvas.write(x + 8, rowY, trim(line, width - 12), color, UI.panel)
    })
  }

  if (model.dialog === "help") {
    const rows = [
      ["Move", "Arrows / WASD"],
      ["Confirm", "Enter / Space"],
      ["Save", "Ctrl+S or F5 saves locally"],
      ["Pack", "I inventory, H potion, L log"],
      ["Combat", "Tab target, 1-3 skill, Enter rolls d20"],
      ["Run", "R rest, Esc pause, Q quit"],
    ]
    rows.forEach((row, index) => {
      const rowY = y + 4 + index * 2
      drawKeycap(canvas, x + 4, rowY, row[0])
      canvas.write(x + 18, rowY, row[1], index === 3 ? UI.gold : UI.ink, UI.panel)
    })
  }

  if (model.dialog === "pause") {
    drawPixelBlock(canvas, x + 5, y + 5, pixelSprite(classSprite(model.session.hero.classId), 10, 5), 0.75)
    canvas.write(x + 19, y + 4, "The dungeon holds your place.", UI.ink, UI.panel)
    drawKeycap(canvas, x + 19, y + 6, "Esc")
    canvas.write(x + 30, y + 6, "Resume", UI.ink, UI.panel)
    drawKeycap(canvas, x + 19, y + 8, "S")
    canvas.write(x + 30, y + 8, "Settings", UI.ink, UI.panel)
    drawKeycap(canvas, x + 19, y + 10, "Q")
    canvas.write(x + 30, y + 10, "Quit to terminal", UI.hp, UI.panel)
    canvas.write(x + 4, y + height - 4, "Race mode keeps the same seed so friends can replay the same generated crawl.", UI.soft, UI.panel)
  }

  canvas.center(y + height - 2, "Esc close", UI.muted, UI.panel)
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

function scrollOffset(index: number, visibleRows: number, count: number) {
  if (count <= visibleRows) return 0
  return clamp(index - Math.floor(visibleRows / 2), 0, count - visibleRows)
}

function formatSaveTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function statusColor(status: string) {
  if (status === "victory") return UI.focus
  if (status === "dead") return UI.hp
  return UI.soft
}

function label(kind: string) {
  if (kind === "slime") return "Slime"
  if (kind === "ghoul") return "Ghoul"
  return "Necromancer"
}

function trim(text: string, width: number) {
  return text.length <= width ? text : text.slice(0, Math.max(0, width - 1))
}

function tint(color: string, factor: number) {
  if (factor >= 0.99) return color
  const r = Math.round(parseInt(color.slice(1, 3), 16) * factor)
  const g = Math.round(parseInt(color.slice(3, 5), 16) * factor)
  const b = Math.round(parseInt(color.slice(5, 7), 16) * factor)
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

function hex(value: number) {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")
}

function fitPattern(text: string, width: number) {
  if (text.length === width) return text
  if (text.length > width) return text.slice(0, width)
  return text + " ".repeat(width - text.length)
}

function wrap(value: number, count: number) {
  return (value + count) % count
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
