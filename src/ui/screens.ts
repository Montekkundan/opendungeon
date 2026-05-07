import { fonts, measureText, type ASCIIFontName, type OptimizedBuffer } from "@opentui/core"
import { activeAssetPack } from "../assets/packs.js"
import { d20FrameCount, d20RollSprite } from "../assets/d20Sprites.js"
import { defaultDiceSkin, diceSkinName, type DiceSkinId } from "../assets/diceSkins.js"
import { animatedPixelSprite, pixelSprite, type PixelSprite, type PixelSpriteId, type SpriteAnimationId } from "../assets/pixelSprites.js"
import {
  actorAt,
  combatModifier,
  combatSkills,
  combatTargets,
  pointKey,
  skillCheckModifier,
  type GameSession,
  type HeroClass,
  type MultiplayerMode,
} from "../game/session.js"
import { saveDirectory, type SaveSummary } from "../game/saveStore.js"
import { profilePath, type UserSettings } from "../game/settingsStore.js"
import { formatModifier, statAbbreviations, statLabels, statLine, statsForClass } from "../game/stats.js"
import { Canvas } from "./canvas.js"

type TileRenderStyle = {
  fg: string
  bg?: string
  pattern: string[]
}

export type ScreenId = "start" | "character" | "mode" | "saves" | "cloud" | "settings" | "controls" | "game"
export type DialogId = "settings" | "inventory" | "help" | "log" | "pause" | null
export type InputMode = { field: "username" | "githubUsername"; draft: string } | null

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
  settings: UserSettings
  settingsIndex: number
  settingsReturnScreen: ScreenId
  inputMode: InputMode
  diceRollAnimation?: DiceRollAnimation | null
}

const startItems = ["Continue last", "New descent", "Load save", "Character", "Multiplayer", "Cloud login", "Settings", "Controls", "Quit"]
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
const settingsOptions = [
  { id: "username", name: "Player name", text: "Saved locally and later used by cloud sync." },
  { id: "controlScheme", name: "Control scheme", text: "Movement and menu navigation preference." },
  { id: "highContrast", name: "High contrast", text: "Brighter borders and selected states." },
  { id: "reduceMotion", name: "Reduce motion", text: "Quieter background and dice movement." },
  { id: "diceSkin", name: "Dice skin", text: "Faceted polyhedral dice color used in combat rolls." },
  { id: "backgroundFx", name: "Background FX", text: "How much title-screen dungeon rain appears." },
  { id: "tileScale", name: "Camera FOV", text: "Wide shows more rooms; close keeps sprite detail." },
  { id: "music", name: "Music", text: "Stored for the future audio layer." },
  { id: "sound", name: "SFX", text: "Stored for combat and loot feedback later." },
] as const

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
  return renderCanvas(model, width, height).toStyledText()
}

export function paint(model: AppModel, width: number, height: number, buffer: OptimizedBuffer) {
  renderCanvas(model, width, height).paint(buffer)
}

function renderCanvas(model: AppModel, width: number, height: number) {
  const canvas = new Canvas(width, height, "#111820")
  if (model.screen === "start") drawStart(canvas, model)
  if (model.screen === "character") drawCharacter(canvas, model)
  if (model.screen === "mode") drawMode(canvas, model)
  if (model.screen === "saves") drawSaves(canvas, model)
  if (model.screen === "cloud") drawCloud(canvas, model)
  if (model.screen === "settings") drawSettings(canvas, model)
  if (model.screen === "controls") drawControls(canvas, model)
  if (model.screen === "game") drawGame(canvas, model)
  if (model.dialog) drawDialog(canvas, model)

  return canvas
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

export function currentSettingItem(model: AppModel) {
  return settingsOptions[model.settingsIndex]
}

export function moveSelection(model: AppModel, delta: number) {
  if (model.screen === "game") return
  if (model.screen === "saves") {
    model.saveIndex = wrap(model.saveIndex + delta, Math.max(1, model.saves.length))
    return
  }

  const count =
    model.screen === "character"
      ? classOptions.length
      : model.screen === "mode"
        ? modeOptions.length
        : model.screen === "cloud"
          ? 3
        : model.screen === "settings"
          ? settingsOptions.length
          : startItems.length
  model.menuIndex = wrap(model.menuIndex + delta, count)
  if (model.screen === "character") model.classIndex = model.menuIndex
  if (model.screen === "mode") model.modeIndex = model.menuIndex
  if (model.screen === "settings") model.settingsIndex = model.menuIndex
}

function drawStart(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed, model.settings)
  const width = Math.min(86, canvas.width - 8)
  const x = Math.floor((canvas.width - width) / 2)
  const compact = canvas.height < 30
  const brandY = compact ? 3 : Math.max(3, Math.floor(canvas.height * 0.23))
  const brandHeight = compact ? drawCompactBrand(canvas, brandY, width) : drawBrand(canvas, x, brandY, width, UI.bg)
  const summaryY = brandY + brandHeight + 1
  const profile = model.settings.username || "local-crawler"
  canvas.center(summaryY, trim(`@${profile}  ${currentClass(model).name}  ${currentMode(model).name}  seed ${model.seed}`, width), UI.brass, UI.bg)
  if (!compact) canvas.center(summaryY + 2, trim(`local saves ${model.saves.length}   art ${activeAssetPack.name}   profile ${profilePath()}`, width), UI.soft, UI.bg)

  const cardW = Math.min(72, width)
  const cardX = Math.floor((canvas.width - cardW) / 2)
  const cardY = compact ? summaryY + 3 : Math.min(canvas.height - 14, summaryY + 5)
  drawCommandBox(canvas, cardX, cardY, cardW, startItems[model.menuIndex], startHint(model))

  const listY = cardY + 4
  const visibleRows = Math.max(4, Math.min(startItems.length, canvas.height - listY - 4))
  const offset = scrollOffset(model.menuIndex, visibleRows, startItems.length)
  startItems.slice(offset, offset + visibleRows).forEach((item, visibleIndex) => {
    const index = offset + visibleIndex
    const selected = model.menuIndex === index
    drawPlainSelectRow(canvas, cardX, listY + visibleIndex, cardW, item, selected, startItemMeta(item, model))
  })
  if (offset > 0) canvas.write(cardX + cardW - 4, listY - 1, "↑", UI.muted, UI.bg)
  if (offset + visibleRows < startItems.length) canvas.write(cardX + cardW - 4, listY + visibleRows, "↓", UI.muted, UI.bg)

  if (model.saveStatus && canvas.height > 30) canvas.center(canvas.height - 5, trim(model.saveStatus, canvas.width - 4), UI.focus, UI.bg)
  drawFooter(canvas, [
    ["Enter", "select"],
    ["↑↓", "navigate"],
    ["n", "new seed"],
    ["?", "help"],
    ["q", "quit"],
  ])
}

function drawCharacter(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 2, model.settings)
  const width = Math.min(90, canvas.width - 8)
  const height = Math.min(22, canvas.height - 6)
  const x = Math.floor((canvas.width - width) / 2)
  const y = Math.max(2, Math.floor((canvas.height - height) / 2))
  drawPanel(canvas, x, y, width, height, "Choose Your Crawler", UI.gold)

  classOptions.forEach((option, index) => {
    const selected = model.classIndex === index
    const row = y + 4 + index * 5
    const sprite = classSprite(option.id)
    drawSelectCard(canvas, x + 3, row - 1, width - 6, 4, selected)
    drawPixelBlock(canvas, x + 6, row, pixelSprite(sprite, 8, 3), selected ? 1 : 0.5)
    canvas.write(x + 17, row, `${selected ? ">" : " "} ${option.name}`, selected ? UI.gold : UI.ink, selected ? UI.panel3 : UI.panel2)
    canvas.write(x + 21, row + 1, option.text, selected ? UI.ink : UI.soft, selected ? UI.panel3 : UI.panel2)
    if (selected && row + 2 < y + height - 2) canvas.write(x + 21, row + 2, trim(statLine(statsForClass(option.id)), width - 30), UI.muted, UI.panel3)
  })

  drawFooter(canvas, [
    ["Enter", "confirm"],
    ["Esc", "title"],
  ])
}

function drawMode(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 4, model.settings)
  const width = Math.min(86, canvas.width - 8)
  const height = Math.min(22, canvas.height - 6)
  const x = Math.floor((canvas.width - width) / 2)
  const y = Math.max(2, Math.floor((canvas.height - height) / 2))
  drawPanel(canvas, x, y, width, height, "Run Mode", UI.gold)
  drawD20Sprite(canvas, x + 5, y + 4, 20, d20FrameCount() - 1, 10, 5, model.settings.diceSkin)

  modeOptions.forEach((option, index) => {
    const selected = model.modeIndex === index
    const row = y + 4 + index * 4
    const rowX = x + 18
    if (selected) drawSelectCard(canvas, rowX - 2, row - 1, width - 24, 3, true)
    canvas.write(rowX, row, `${selected ? ">" : " "} ${option.name}`, selected ? UI.gold : UI.ink, selected ? UI.panel3 : UI.panel)
    canvas.write(rowX + 4, row + 1, option.text, selected ? UI.ink : UI.soft, selected ? UI.panel3 : UI.panel)
  })

  canvas.write(x + 4, y + height - 4, `Host lobby: bun run host -- --mode ${currentMode(model).id} --seed ${model.seed}`, UI.soft, UI.panel)
  canvas.write(x + 4, y + height - 3, "Friends reuse the shared seed for co-op or race runs.", UI.muted, UI.panel)
  drawFooter(canvas, [
    ["Enter", "confirm"],
    ["Esc", "title"],
  ])
}

function drawSaves(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 8, model.settings)
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

  if (model.saveStatus) canvas.center(canvas.height - 5, trim(model.saveStatus, canvas.width - 4), UI.focus)
  drawFooter(canvas, [
    ["Enter", "load"],
    ["↑↓", "choose"],
    ["r", "refresh"],
    ["d", "delete"],
    ["Esc", "title"],
  ])
}

function drawCloud(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 12, model.settings)
  const width = Math.min(74, canvas.width - 8)
  const x = Math.floor((canvas.width - width) / 2)
  const compact = canvas.height < 30
  const brandY = compact ? 4 : Math.max(4, Math.floor(canvas.height * 0.3))
  const brandHeight = compact ? drawCompactBrand(canvas, brandY, width) : drawBrand(canvas, x, brandY, width, UI.bg)
  const inputY = brandY + brandHeight + 3
  const editing = model.inputMode?.field === "githubUsername"
  const githubName = editing ? model.inputMode?.draft ?? "" : model.settings.githubUsername
  const shownName = githubName || "github username"

  drawCommandBox(canvas, x, inputY, width, shownName, "GitHub cloud identity")
  canvas.write(x + 3, inputY + 1, editing ? ">" : " ", editing ? UI.gold : UI.muted, UI.panel2)
  canvas.write(x + 5, inputY + 1, editing ? `${shownName}_` : shownName, editing ? UI.ink : UI.soft, UI.panel2)

  const rowY = inputY + (compact ? 4 : 5)
  drawPlainSelectRow(canvas, x, rowY, width, "Sign in with GitHub", model.menuIndex === 0, "device auth later; saves stay local now")
  drawPlainSelectRow(canvas, x, rowY + 2, width, "Use local profile", model.menuIndex === 1, `profile @${model.settings.username}`)
  drawPlainSelectRow(canvas, x, rowY + 4, width, "Back to title", model.menuIndex === 2, "return without syncing")

  if (!compact) {
    canvas.center(rowY + 8, trim("Cloud sync will use GitHub login, encrypted save envelopes, and conflict prompts.", width), UI.soft, UI.bg)
    canvas.center(rowY + 10, trim(`Local profile: ${profilePath()}`, width), UI.muted, UI.bg)
  }
  drawFooter(canvas, [
    ["Enter", "confirm"],
    ["u", "edit name"],
    ["Esc", "title"],
  ])
}

function drawSettings(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 16, model.settings)
  const width = Math.min(104, canvas.width - 8)
  const height = Math.min(30, canvas.height - 6)
  const x = Math.floor((canvas.width - width) / 2)
  const y = Math.max(2, Math.floor((canvas.height - height) / 2))
  drawPanel(canvas, x, y, width, height, "Settings", model.settings.highContrast ? UI.focus : UI.gold)

  const listX = x + 4
  const listY = y + 4
  const listW = Math.min(50, Math.floor(width * 0.52))
  const rowGap = 3
  const visibleRows = Math.max(3, Math.min(settingsOptions.length, Math.floor((height - 7) / rowGap)))
  const offset = scrollOffset(model.settingsIndex, visibleRows, settingsOptions.length)
  settingsOptions.slice(offset, offset + visibleRows).forEach((option, visibleIndex) => {
    const index = offset + visibleIndex
    const selected = model.settingsIndex === index
    const rowY = listY + visibleIndex * rowGap
    drawSelectCard(canvas, listX, rowY, listW, 2, selected)
    canvas.write(listX + 2, rowY, `${selected ? ">" : " "} ${option.name}`, selected ? UI.gold : UI.ink, selected ? UI.panel3 : UI.panel2)
    canvas.write(listX + listW - 18, rowY, trim(settingValue(model.settings, option.id), 16), selected ? UI.focus : UI.soft, selected ? UI.panel3 : UI.panel2)
    canvas.write(listX + 4, rowY + 1, trim(option.text, listW - 6), selected ? UI.ink : UI.muted, selected ? UI.panel3 : UI.panel2)
  })
  if (offset > 0) canvas.write(listX + listW - 3, listY - 1, "↑", UI.muted, UI.panel)
  if (offset + visibleRows < settingsOptions.length) canvas.write(listX + listW - 3, listY + visibleRows * rowGap, "↓", UI.muted, UI.panel)

  const detailX = listX + listW + 4
  const detailW = width - (detailX - x) - 4
  const detailH = Math.min(19, height - 8)
  drawPanel(canvas, detailX, listY, detailW, detailH, "Profile & Dice", UI.edge)
  drawMiniIcon(canvas, detailX + 3, listY + 3, "focus-gem", 8, 3)
  if (detailW > 28 && detailH > 7) drawD20Sprite(canvas, detailX + detailW - 15, listY + 3, 20, d20FrameCount() - 1, 10, 4, model.settings.diceSkin)
  const editing = model.inputMode?.field === "username"
  const name = editing ? `${model.inputMode?.draft ?? ""}_` : `@${model.settings.username}`
  if (detailH > 8) drawSettingRow(canvas, detailX + 3, listY + 7, detailW - 6, "Player", name)
  if (detailH > 10) drawSettingRow(canvas, detailX + 3, listY + 9, detailW - 6, "Dice", diceSkinName(model.settings.diceSkin))
  if (detailH > 12) drawSettingRow(canvas, detailX + 3, listY + 11, detailW - 6, "Profile", profilePath())
  if (detailH > 14) drawSettingRow(canvas, detailX + 3, listY + 13, detailW - 6, "Saves", saveDirectory())
  if (detailH > 16) drawSettingRow(canvas, detailX + 3, listY + 15, detailW - 6, "Cloud", model.settings.cloudProvider === "github" ? "GitHub selected" : "local-only")
  if (detailH > 18) canvas.write(detailX + 3, listY + 17, "Settings are saved immediately on this computer.", UI.soft, UI.panel)

  drawFooter(canvas, [
    ["Enter", "change"],
    ["u", "edit name"],
    ["c", "controls"],
    ["Esc", model.settingsReturnScreen === "game" ? "game" : "title"],
  ])
}

function drawControls(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 18, model.settings)
  const width = Math.min(96, canvas.width - 8)
  const height = Math.min(28, canvas.height - 6)
  const x = Math.floor((canvas.width - width) / 2)
  const y = Math.max(2, Math.floor((canvas.height - height) / 2))
  drawPanel(canvas, x, y, width, height, "Controls & Accessibility", UI.gold)

  const rows = [
    ["Move", controlMoveText(model.settings.controlScheme)],
    ["Menus", "Arrows always work. WASD follows the selected control scheme."],
    ["Combat", "Tab selects an enemy. 1-3 selects a skill. Enter rolls d20."],
    ["Inventory", "I opens pack. H drinks potion. L opens run log."],
    ["Run", "R rests outside combat. Esc pauses. Ctrl+S/F5 saves locally."],
    ["Accessibility", accessibilitySummary(model.settings)],
    ["Visuals", `Camera ${model.settings.tileScale}. Dice ${diceSkinName(model.settings.diceSkin)}. FX ${model.settings.backgroundFx}.`],
    ["Audio", `Music ${onOff(model.settings.music)}. SFX ${onOff(model.settings.sound)}.`],
  ]

  const visibleRows = Math.max(4, Math.min(rows.length, Math.floor((height - 8) / 2)))
  rows.slice(0, visibleRows).forEach((row, index) => {
    const rowY = y + 4 + index * 2
    drawKeycap(canvas, x + 4, rowY, row[0])
    canvas.write(x + 20, rowY, trim(row[1], width - 24), index === 5 ? UI.gold : UI.ink, UI.panel)
  })

  if (height > 24) {
    canvas.write(x + 4, y + height - 5, "Change these values in Settings. They are stored in the local profile file.", UI.soft, UI.panel)
    canvas.write(x + 4, y + height - 4, trim(profilePath(), width - 8), UI.muted, UI.panel)
  }
  drawFooter(canvas, [
    ["s", "settings"],
    ["Esc", model.settingsReturnScreen === "game" ? "game" : "title"],
  ])
}

function drawGame(canvas: Canvas, model: AppModel) {
  const session = model.session
  drawMap(canvas, session, model.debugView, model.settings)
  drawHud(canvas, session)
  if (!model.debugView) drawQuickbar(canvas, session, model.diceRollAnimation, model.settings)
  if (session.combat.active) drawCombatPanel(canvas, session, model.diceRollAnimation, model.settings)
  if (session.status !== "running") drawRunEnd(canvas, session)
  if (session.skillCheck) drawSkillCheckModal(canvas, session, model.diceRollAnimation, model.settings)
}

function drawMap(canvas: Canvas, session: GameSession, debugView: boolean, settings: UserSettings) {
  const tileSize = mapTileSize(canvas, debugView, settings.tileScale)
  const tileWidth = tileSize.width
  const tileHeight = tileSize.height
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

      if (session.player.x === x && session.player.y === y) {
        drawSprite(canvas, screenX, screenY, tileWidth, tileHeight, classSprite(session.hero.classId), debugView, playerAnimation(session), session.turn)
      }
      else if (actor) {
        drawSprite(canvas, screenX, screenY, tileWidth, tileHeight, actor.kind, debugView, actorAnimation(actor.id === selectedTargetId, session), session.turn + sx + sy)
        if (actor.id === selectedTargetId) drawTargetFrame(canvas, screenX, screenY, tileWidth, tileHeight, debugView)
      }
    }
  }
}

function mapTileSize(canvas: Canvas, debugView: boolean, preference: UserSettings["tileScale"]) {
  if (debugView) return { width: 2, height: 1 }

  const forced = process.env.OPENDUNGEON_TILE_SCALE
  if (forced === "overview" || forced === "compact") return { width: 10, height: 5 }
  if (forced === "wide") return { width: 14, height: 7 }
  if (forced === "medium") return { width: 18, height: 9 }
  if (forced === "large" || forced === "close") return { width: 24, height: 12 }
  if (preference === "overview") return { width: 10, height: 5 }
  if (preference === "wide") return { width: 14, height: 7 }
  if (preference === "medium") return { width: 18, height: 9 }
  if (preference === "close") return { width: 24, height: 12 }

  if (canvas.width >= 132 && canvas.height >= 38) return { width: 14, height: 7 }
  if (canvas.width >= 96 && canvas.height >= 30) return { width: 12, height: 6 }
  return { width: 10, height: 5 }
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

function drawSprite(
  canvas: Canvas,
  x: number,
  y: number,
  width: number,
  height: number,
  sprite: PixelSpriteId | "player",
  debugView: boolean,
  animation: SpriteAnimationId = "idle",
  frameSeed = 0,
) {
  const spriteId: PixelSpriteId = sprite === "player" ? "hero-ranger" : sprite
  if (debugView) {
    if (spriteId.startsWith("hero")) {
      canvas.write(x, y, "@@", "#f4d06f")
      return
    }
    const actor = spriteId === "ghoul" || spriteId === "necromancer" || spriteId === "slime" ? activeAssetPack.actors[spriteId] : activeAssetPack.actors.player
    canvas.write(x, y, actor.glyph.repeat(2), actor.fg)
    return
  }

  drawPixelBlock(canvas, x, y, animatedPixelSprite(spriteId, animation, frameSeed, width, height), 1)
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
  if (height > 6) canvas.write(13, 6, trim(statLine(session.stats), leftW - 16), UI.muted, UI.panel)

  drawPanel(canvas, centerX, 0, centerW, height, "Vitals", UI.edge)
  drawHudBar(canvas, centerX + 3, 2, Math.max(16, Math.floor(centerW * 0.46)), "HP", session.hp, session.maxHp, UI.hp, UI.hpBack)
  drawHudBar(canvas, centerX + Math.floor(centerW * 0.52), 2, Math.max(14, Math.floor(centerW * 0.39)), "FOCUS", session.focus, session.maxFocus, UI.focus, UI.focusBack)
  canvas.write(centerX + 3, 4, trim(compactControls(session), centerW - 6), UI.muted, UI.panel)
  if (session.skillCheck) canvas.write(centerX + 3, 5, "Talent check: Enter rolls the d20. Stats decide the consequence.", UI.gold, UI.panel)
  else if (session.combat.active) canvas.write(centerX + 3, 5, "Initiative: target with Tab, choose a skill, roll the d20.", UI.gold, UI.panel)
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

function drawQuickbar(canvas: Canvas, session: GameSession, animation: DiceRollAnimation | null | undefined, settings: UserSettings) {
  const height = gameQuickbarHeight(canvas)
  if (!height) return
  const slotCount = 6
  const slotWidth = height >= 10 ? 16 : 13
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
    if (item.custom === "d20") {
      const diceWidth = height >= 10 ? 11 : 8
      const diceHeight = height >= 10 ? 5 : 3
      drawD20Sprite(canvas, slotX + 2, y + 2, diceResult(session, animation), diceFrame(session, animation), diceWidth, diceHeight, settings.diceSkin, item.active && !settings.reduceMotion, animation)
    } else if (item.sprite) {
      drawMiniIcon(canvas, slotX + 3, y + 2, item.sprite, height >= 10 ? 9 : 7, height >= 10 ? 4 : 3)
    }
    canvas.write(slotX + 1, y + height - 3, trim(item.label, slotWidth - 3), item.active ? UI.gold : UI.soft, UI.panel2)
    if (item.count !== undefined && item.count !== "0") {
      const count = trim(item.count, 3)
      canvas.write(slotX + slotWidth - count.length - 2, y + 1, count, UI.gold, UI.panel2)
    }
  })
}

function drawCombatPanel(canvas: Canvas, session: GameSession, animation: DiceRollAnimation | null | undefined, settings: UserSettings) {
  const width = Math.min(58, Math.max(38, Math.floor(canvas.width * 0.35)))
  const height = Math.min(18, Math.max(14, canvas.height - gameHudHeight(canvas) - gameQuickbarHeight(canvas) - 2))
  const x = Math.max(1, canvas.width - width - 2)
  const y = Math.max(gameHudHeight(canvas) + 1, canvas.height - gameQuickbarHeight(canvas) - height - 1)
  const targets = combatTargets(session)
  const selectedSkill = combatSkills[session.combat.selectedSkill]
  const roll = session.combat.lastRoll

  drawPanel(canvas, x, y, width, height, "Turn Combat", UI.gold)
  drawD20Sprite(canvas, x + width - 14, y + 1, diceResult(session, animation), diceFrame(session, animation), 11, 4, settings.diceSkin, !settings.reduceMotion, animation)

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
    const modifier = combatModifier(session, skill.stat)
    const text = `${index + 1} ${skill.name} ${statAbbreviations[skill.stat]} ${formatModifier(modifier)} F${skill.cost}`
    const row = y + 4 + index
    if (selected) canvas.fill(skillX, row, width - (skillX - x) - 2, 1, " ", UI.panel3, UI.panel3)
    canvas.write(skillX + 1, row, trim(text, width - (skillX - x) - 4), unavailable ? UI.muted : selected ? UI.focus : UI.ink, selected ? UI.panel3 : UI.panel)
  })

  canvas.fill(x + 2, y + height - 7, width - 4, 3, " ", UI.panel2, UI.panel2)
  canvas.write(x + 3, y + height - 7, trim(selectedSkill.text, width - 6), UI.soft, UI.panel2)
  canvas.write(x + 3, y + height - 6, trim(session.combat.message, width - 6), UI.ink, UI.panel2)

  const diceX = x + width - 18
  const diceY = y + height - 7
  canvas.border(diceX, diceY, 15, 6, roll?.hit ? UI.focus : UI.hp)
  drawD20Sprite(canvas, diceX + 1, diceY + 1, diceResult(session, animation), diceFrame(session, animation), 8, 4, settings.diceSkin, !settings.reduceMotion, animation)
  canvas.write(diceX + 10, diceY + 2, roll ? String(roll.d20).padStart(2, "0") : "d20", roll?.hit ? UI.focus : UI.gold)
  canvas.write(diceX + 2, diceY + 4, roll ? `${roll.total}/${roll.dc}` : statAbbreviations[selectedSkill.stat], UI.ink)

  const footer = roll ? `${roll.skill} ${roll.hit ? "hit" : "miss"} ${roll.target}` : "Enter rolls selected skill"
  canvas.write(x + 2, y + height - 2, trim(footer, width - 4), UI.muted, UI.panel)
}

function drawSkillCheckModal(canvas: Canvas, session: GameSession, animation: DiceRollAnimation | null | undefined, settings: UserSettings) {
  const check = session.skillCheck
  if (!check) return

  const width = Math.min(92, canvas.width - 8)
  const height = Math.min(20, canvas.height - 6)
  const x = Math.floor((canvas.width - width) / 2)
  const y = Math.floor((canvas.height - height) / 2)
  const roll = check.roll
  const modifier = roll?.modifier ?? skillCheckModifier(session, check.stat)
  const total = roll?.total
  const result = roll?.d20 ?? animation?.result ?? 20
  const frame = animation ? diceFrame(session, animation) : roll ? d20FrameCount() - 1 : 0
  const resolved = check.status === "resolved" && roll

  drawPanel(canvas, x, y, width, height, "Talent Check", resolved ? (roll.success ? UI.focus : UI.hp) : UI.gold)
  drawCheckBar(canvas, x + 4, y + 3, Math.floor(width * 0.43), "DIFFICULTY", String(check.dc), check.dc, 30, UI.gold)
  drawCheckBar(canvas, x + Math.floor(width * 0.51), y + 3, Math.floor(width * 0.43), "TALENT CHECK", total === undefined ? `d20 ${formatModifier(modifier)}` : String(total), total ?? Math.max(1, modifier + 10), 30, roll?.success ? UI.focus : UI.hp)

  const dicePanelW = Math.floor(width * 0.48)
  const dicePanelH = 7
  const diceX = x + 4
  const diceY = y + 7
  canvas.fill(diceX, diceY, dicePanelW, dicePanelH, " ", UI.panel2, UI.panel2)
  canvas.border(diceX, diceY, dicePanelW, dicePanelH, UI.edge)
  drawD20Sprite(canvas, diceX + 4, diceY + 1, result, frame, 12, 5, settings.diceSkin, check.status === "pending" || Boolean(animation), animation)
  canvas.write(diceX + 20, diceY + 2, `${statLabels[check.stat]} ${session.stats[check.stat]}`, UI.gold, UI.panel2)
  canvas.write(diceX + 20, diceY + 3, `Modifier ${formatModifier(modifier)}`, UI.ink, UI.panel2)
  canvas.write(diceX + 20, diceY + 4, roll ? `Roll ${roll.d20}` : "Press Enter to roll", roll ? UI.soft : UI.focus, UI.panel2)

  const infoX = diceX + dicePanelW + 2
  const infoW = width - (infoX - x) - 4
  canvas.fill(infoX, diceY, infoW, 3, " ", UI.panel2, UI.panel2)
  canvas.border(infoX, diceY, infoW, 3, UI.edge)
  writeCentered(canvas, infoX, diceY + 1, infoW, trim(check.title, infoW - 4), UI.ink, UI.panel2)
  canvas.fill(infoX, diceY + 4, infoW, 3, " ", UI.panel2, UI.panel2)
  canvas.border(infoX, diceY + 4, infoW, 3, UI.edge)
  drawPixelBlock(canvas, infoX + infoW - 10, diceY + 4, pixelSprite(classSprite(session.hero.classId), 8, 3), 0.85)
  canvas.write(infoX + 2, diceY + 5, trim(check.actor, infoW - 14), UI.gold, UI.panel2)

  canvas.write(x + 4, y + height - 5, trim(check.prompt, width - 8), UI.soft, UI.panel)
  if (resolved) {
    const color = roll.success ? UI.focus : UI.hp
    canvas.fill(x + Math.floor(width / 2) - 12, y + height - 3, 24, 1, " ", UI.panel3, UI.panel3)
    writeCentered(canvas, x, y + height - 3, width, roll.success ? "SUCCESS" : "FAILURE", color, UI.panel3)
    canvas.center(y + height - 2, trim(roll.consequence, width - 8), UI.ink, UI.panel)
  } else {
    canvas.center(y + height - 3, "Enter roll d20", UI.focus, UI.panel)
    canvas.center(y + height - 2, "Stats, luck, and level are added before the consequence lands.", UI.muted, UI.panel)
  }
}

function drawCheckBar(canvas: Canvas, x: number, y: number, width: number, labelText: string, valueText: string, value: number, max: number, color: string) {
  const barY = y + 1
  canvas.write(x + 1, y, labelText, UI.ink, UI.panel)
  canvas.fill(x, barY, width, 3, " ", UI.panel2, UI.panel2)
  canvas.border(x, barY, width, 3, UI.edge)
  const fillWidth = clamp(Math.round(((Math.max(0, value) / max) * (width - 2))), 1, width - 2)
  canvas.fill(x + 1, barY + 1, fillWidth, 1, " ", color, color)
  canvas.write(x + 2, barY + 1, trim(valueText, width - 4), UI.ink, color)
}

function writeCentered(canvas: Canvas, x: number, y: number, width: number, text: string, fg: string, bg?: string) {
  canvas.write(x + Math.max(0, Math.floor((width - text.length) / 2)), y, text, fg, bg)
}

function gameHudHeight(canvas: Canvas) {
  return canvas.height < 28 ? 4 : 7
}

function gameQuickbarHeight(canvas: Canvas) {
  if (canvas.height < 30 || canvas.width < 90) return 0
  return canvas.height >= 42 && canvas.width >= 120 ? 10 : 8
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

function drawCommandBox(canvas: Canvas, x: number, y: number, width: number, labelText: string, hint: string) {
  canvas.fill(x, y, width, 3, " ", "#1b1b1b", "#1b1b1b")
  canvas.fill(x, y, 1, 3, " ", UI.focus, UI.focus)
  canvas.write(x + 3, y + 1, trim(labelText, Math.floor(width * 0.58)), UI.ink, "#1b1b1b")
  canvas.write(x + Math.max(18, width - hint.length - 3), y + 1, trim(hint, Math.floor(width * 0.38)), UI.muted, "#1b1b1b")
}

function drawPlainSelectRow(canvas: Canvas, x: number, y: number, width: number, labelText: string, selected: boolean, meta = "") {
  const bg = selected ? UI.panel3 : UI.bg
  if (selected) {
    canvas.fill(x, y, width, 1, " ", bg, bg)
    canvas.fill(x, y, 1, 1, " ", UI.gold, UI.gold)
  }
  canvas.write(x + 3, y, `${selected ? ">" : " "} ${labelText}`, selected ? UI.gold : UI.ink, bg)
  if (meta && width > 42) canvas.write(x + Math.max(28, width - meta.length - 2), y, trim(meta, Math.max(8, width - 32)), selected ? UI.focus : UI.muted, bg)
}

function drawSelectCard(canvas: Canvas, x: number, y: number, width: number, height: number, selected: boolean) {
  const bg = selected ? UI.panel3 : UI.panel2
  canvas.fill(x, y, width, height, " ", bg, bg)
  canvas.border(x, y, width, height + 1, selected ? UI.gold : UI.edgeDim)
  if (selected) canvas.fill(x, y, 1, height, " ", UI.gold, UI.gold)
}

function drawFooter(canvas: Canvas, items: Array<[string, string]>) {
  const textWidth = items.reduce((sum, item) => sum + item[0].length + item[1].length + 4, 0)
  const width = Math.min(canvas.width - 4, Math.max(18, textWidth + 2))
  const x = Math.floor((canvas.width - width) / 2)
  const y = canvas.height - 2
  canvas.fill(x, y, width, 1, " ", "#151a21", "#151a21")
  let cursor = x + 1
  for (const [key, labelText] of items) {
    canvas.write(cursor, y, key, UI.gold, "#151a21")
    cursor += key.length + 1
    canvas.write(cursor, y, labelText, UI.ink, "#151a21")
    cursor += labelText.length + 2
  }
}

function drawBrand(canvas: Canvas, x: number, y: number, width: number, bg = UI.panel) {
  const font = brandFont(width)
  const measured = measureText({ text: "OPENDUNGEON", font })
  drawAsciiFont(canvas, x, y, width, "OPENDUNGEON", font, [UI.brass, UI.gold], bg)
  if (width > 24) canvas.write(x, y + measured.height, trim("terminal dungeon crawler", width), UI.soft, bg)
  return measured.height + (width > 24 ? 1 : 0)
}

function drawCompactBrand(canvas: Canvas, y: number, width: number) {
  canvas.center(y, trim("opendungeon", width), UI.ink, UI.bg)
  return 1
}

function brandFont(width: number): ASCIIFontName {
  if (width >= 70) return "pallet"
  if (width >= 56) return "grid"
  return "tiny"
}

function drawAsciiFont(canvas: Canvas, x: number, y: number, width: number, text: string, font: ASCIIFontName, colors: string[], bg: string) {
  const fontDef = fonts[font]
  const rows = Array.from({ length: fontDef.lines }, () => "")
  const chars = text.toUpperCase().split("")

  chars.forEach((char, charIndex) => {
    const glyph = fontDef.chars[char as keyof typeof fontDef.chars] ?? fontDef.chars[" "]
    for (let row = 0; row < fontDef.lines; row++) {
      rows[row] += cleanFontLine(glyph[row] ?? "")
      if (charIndex < chars.length - 1) rows[row] += cleanFontLine(fontDef.letterspace[row] ?? " ")
    }
  })

  rows.forEach((row, index) => canvas.write(x, y + index, trim(row, width), colors[index % colors.length], bg))
}

function cleanFontLine(line: string) {
  return line.replace(/<\/?c\d+>/g, "")
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
  skin: DiceSkinId = defaultDiceSkin,
  moving = false,
  animation?: DiceRollAnimation | null,
) {
  const shake = moving && animation ? diceShake(frame) : { x: 0, y: 0 }
  drawPixelBlock(canvas, x + shake.x, y + shake.y, d20RollSprite(result, frame, width, height, skin), 1)
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
    { x: -2, y: 0 },
    { x: 2, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 2 },
    { x: 2, y: 0 },
    { x: 0, y: -2 },
    { x: -1, y: -1 },
    { x: 1, y: 1 },
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
  skin: DiceSkinId = defaultDiceSkin,
) {
  canvas.fill(x + 2, y + 1, width, height, " ", UI.shadow, UI.shadow)
  canvas.fill(x, y, width, height, " ", UI.panel, UI.panel)
  canvas.border(x, y, width, height, UI.gold)
  canvas.fill(x + 1, y + 1, width - 2, 2, " ", UI.panel2, UI.panel2)
  canvas.write(x + 4, y + 1, title.toUpperCase(), UI.gold, UI.panel2)
  if (icon === "d20") drawD20Sprite(canvas, x + width - 12, y + 1, 20, d20FrameCount() - 1, 9, 3, skin)
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

function playerAnimation(session: GameSession): SpriteAnimationId {
  if (session.status === "dead") return "death"
  if (session.combat.active) return session.combat.lastRoll?.hit ? "attack-melee" : "idle"
  return "walk"
}

function actorAnimation(selected: boolean, session: GameSession): SpriteAnimationId {
  if (selected) return "shocked"
  if (session.combat.active) return "idle"
  return "walk"
}

function classSprite(classId: HeroClass): PixelSpriteId {
  if (classId === "arcanist") return "hero-arcanist"
  if (classId === "warden") return "hero-warden"
  return "hero-ranger"
}

function actorSpriteId(kind: string): PixelSpriteId {
  if (kind === "ghoul") return "ghoul"
  if (kind === "necromancer") return "necromancer"
  return "slime"
}

function compactControls(session: GameSession) {
  return session.combat.active
    ? "Tab target   1-3 skill   Enter roll   H potion   Ctrl+S save"
    : "I inventory   L log   H potion   -/= camera   Ctrl+S save   Esc pause"
}

function writeRight(canvas: Canvas, y: number, text: string, color: string) {
  canvas.write(Math.max(1, canvas.width - text.length - 2), y, text, color)
}

function drawDialog(canvas: Canvas, model: AppModel) {
  if (!model.dialog) return
  const wide = model.dialog === "inventory" || model.dialog === "log" || model.dialog === "settings"
  const width = Math.min(wide ? 88 : 74, canvas.width - 10)
  const height = model.dialog === "inventory" || model.dialog === "log" ? 18 : model.dialog === "settings" ? 20 : model.dialog === "help" ? 18 : 14
  const x = Math.floor((canvas.width - width) / 2)
  const y = Math.floor((canvas.height - height) / 2)
  drawDialogFrame(canvas, x, y, width, height, dialogTitle(model.dialog), dialogIcon(model.dialog), model.settings.diceSkin)

  if (model.dialog === "settings") {
    drawSettingRow(canvas, x + 4, y + 4, width - 8, "Seed", String(model.seed))
    drawSettingRow(canvas, x + 4, y + 6, width - 8, "Renderer", model.rendererBackend === "three" ? "@opentui/three preview disabled" : "Itch cache + terminal sprites")
    drawSettingRow(canvas, x + 4, y + 8, width - 8, "Camera", `${model.settings.tileScale} FOV, ${activeAssetPack.tileSize}px source actors`)
    drawSettingRow(canvas, x + 4, y + 10, width - 8, "Debug", model.debugView ? "on via OPENDUNGEON_DEBUG_VIEW=1" : "off")
    drawSettingRow(canvas, x + 4, y + 12, width - 8, "Save path", saveDirectory())
    drawSettingRow(canvas, x + 4, y + 14, width - 8, "Cloud", "planned GitHub login + encrypted save sync")
    drawSettingRow(canvas, x + 4, y + 16, width - 8, "Host", `bun run host -- --mode race --seed ${model.seed}`)
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
      ["Camera", "- wider FOV, = closer view"],
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

  canvas.fill(x + Math.floor(width / 2) - 6, y + height - 2, 12, 1, " ", UI.panel3, UI.panel3)
  canvas.write(x + Math.floor(width / 2) - 4, y + height - 2, "Esc", UI.gold, UI.panel3)
  canvas.write(x + Math.floor(width / 2), y + height - 2, "close", UI.ink, UI.panel3)
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

function drawDungeonBackdrop(canvas: Canvas, seed: number, settings?: UserSettings) {
  const dotMod = settings?.backgroundFx === "dense" ? 17 : settings?.backgroundFx === "low" || settings?.reduceMotion ? 37 : 23
  const blockMod = settings?.backgroundFx === "dense" ? 43 : settings?.backgroundFx === "low" || settings?.reduceMotion ? 89 : 61
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if ((x * 17 + y * 31 + seed) % dotMod === 0) canvas.write(x, y, "·", settings?.highContrast ? "#2e555b" : "#1f3438")
      else if ((x * 7 + y * 13 + seed) % blockMod === 0) canvas.write(x, y, "█", settings?.highContrast ? "#222936" : "#181c22")
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

function startHint(model: AppModel) {
  const item = currentStartItem(model)
  if (item === "Continue last") return model.saves.length ? "latest save" : "no saves yet"
  if (item === "New descent") return `${currentClass(model).name} / ${currentMode(model).name}`
  if (item === "Load save") return `${model.saves.length} local`
  if (item === "Cloud login") return model.settings.githubUsername ? `@${model.settings.githubUsername}` : "local-only"
  if (item === "Settings") return "profile + accessibility"
  if (item === "Controls") return model.settings.controlScheme
  return "open"
}

function startItemMeta(item: string, model: AppModel) {
  if (item === "Continue last") return model.saves.length ? "c" : "empty"
  if (item === "New descent") return "play"
  if (item === "Load save") return `${model.saves.length}`
  if (item === "Character") return currentClass(model).name
  if (item === "Multiplayer") return currentMode(model).name
  if (item === "Cloud login") return model.settings.cloudProvider
  if (item === "Settings") return "local"
  if (item === "Controls") return model.settings.controlScheme
  return ""
}

function settingValue(settings: UserSettings, id: (typeof settingsOptions)[number]["id"]) {
  if (id === "username") return settings.username
  if (id === "controlScheme") return settings.controlScheme
  if (id === "highContrast") return onOff(settings.highContrast)
  if (id === "reduceMotion") return onOff(settings.reduceMotion)
  if (id === "diceSkin") return diceSkinName(settings.diceSkin)
  if (id === "backgroundFx") return settings.backgroundFx
  if (id === "tileScale") return settings.tileScale
  if (id === "music") return onOff(settings.music)
  return onOff(settings.sound)
}

function controlMoveText(scheme: UserSettings["controlScheme"]) {
  if (scheme === "arrows") return "Arrow keys only for movement."
  if (scheme === "vim") return "Arrows, WASD, and HJKL movement."
  return "Arrows and WASD movement."
}

function accessibilitySummary(settings: UserSettings) {
  return `High contrast ${onOff(settings.highContrast)}. Reduce motion ${onOff(settings.reduceMotion)}.`
}

function onOff(value: boolean) {
  return value ? "on" : "off"
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
