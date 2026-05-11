import { type OptimizedBuffer } from "@opentui/core"
import { activeAssetPack } from "../assets/packs.js"
import { d20FrameCount, d20RollSprite } from "../assets/d20Sprites.js"
import { defaultDiceSkin, diceSkinIds, diceSkinName, type DiceSkinId } from "../assets/diceSkins.js"
import { animatedPixelSprite, pixelSprite, type PixelSprite, type PixelSpriteId, type SpriteAnimationId } from "../assets/pixelSprites.js"
import { portraitIdForSprite, portraitSprite } from "../assets/portraitSprites.js"
import { authStatusReport, formatAuthStatus } from "../cloud/authStatus.js"
import { buildCloudSaveBrowserState } from "../cloud/cloudSaves.js"
import {
  actorAt,
  combatModifier,
  combatSkills,
  combatTargets,
  currentBiome,
  enemyBehaviorText,
  fleeDc,
  fleeModifier,
  focusCostForSkill,
  hubStationIds,
  pointKey,
  skillCheckModifier,
  statusEffectsFor,
  startingLoadout,
  villageLocationIds,
  villageLocations,
  villageNpcIds,
  type GameSession,
  type HeroClass,
  type MultiplayerMode,
} from "../game/session.js"
import { appearanceLabel, heroSpriteForAppearance, normalizeHeroAppearance, weaponSpriteForAppearance, type HeroAppearance } from "../game/appearance.js"
import { isEnemyActorId, isNpcActorId, type TileId } from "../game/domainTypes.js"
import { actorLabel } from "../game/glyphs.js"
import { saveDirectory, type SaveSummary } from "../game/saveStore.js"
import { profilePath, type UserSettings } from "../game/settingsStore.js"
import { formatModifier, statAbbreviations, statLabels, statLine, statsForClass } from "../game/stats.js"
import { clamp, wrap } from "../shared/numeric.js"
import { titleUpdateNotice, type UpdateStatus } from "../system/updateCheck.js"
import { Canvas } from "./canvas.js"

type TileRenderStyle = {
  fg: string
  bg?: string
  pattern: string[]
}

type PanelBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type ScreenId = "start" | "character" | "mode" | "saves" | "cloud" | "settings" | "controls" | "tutorial" | "game" | "village"
export type DialogId = "settings" | "inventory" | "book" | "quests" | "hub" | "saveManager" | "cutscene" | "help" | "log" | "map" | "pause" | "quit" | null
export type InputMode = { field: "username" | "githubUsername" | "saveName" | "characterName"; draft: string } | null
export type InternetStatus = "checking" | "online" | "offline"

export type DiceRollAnimation = {
  result: number
  startedAt: number
  durationMs: number
}

export type PlayerMoveAnimation = {
  startedAt: number
  durationMs: number
  direction: "up" | "down" | "left" | "right"
}

export type CameraFocus = { x: number; y: number } | null

export type ScreenTransition = {
  from: ScreenId
  to: ScreenId
  startedAt: number
  durationMs: number
  label: string
  kind: "screen" | "portal" | "village"
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
  settingsTabIndex: number
  settingsIndex: number
  settingsReturnScreen: ScreenId
  inputMode: InputMode
  uiHidden: boolean
  inventoryIndex: number
  inventoryDragIndex: number | null
  bookIndex: number
  questIndex: number
  tutorialIndex: number
  internetStatus: InternetStatus
  currentVersion: string
  updateStatus: UpdateStatus
  animationFrame: number
  playerMoveAnimation?: PlayerMoveAnimation | null
  diceRollAnimation?: DiceRollAnimation | null
  cameraFocus?: CameraFocus
  screenTransition?: ScreenTransition | null
}

const startItems = ["Continue last", "New descent", "Load save", "Character", "Multiplayer", "Cloud login", "Tutorial", "Settings", "Controls", "Quit"]
const classOptions: Array<{ id: HeroClass; name: string; text: string }> = [
  { id: "warden", name: "Warden", text: "High HP, low focus. Holds corridors." },
  { id: "arcanist", name: "Arcanist", text: "Low HP, high focus. Deletes threats." },
  { id: "ranger", name: "Ranger", text: "Balanced. Best first run." },
  { id: "duelist", name: "Duelist", text: "Fast precision crawler with strong single-target pressure." },
  { id: "cleric", name: "Cleric", text: "Faith-heavy support crawler with steadier recovery." },
  { id: "engineer", name: "Engineer", text: "Trapwise crawler with tools, scrolls, and strong checks." },
  { id: "witch", name: "Witch", text: "Mind and luck caster with risky occult inventory." },
  { id: "grave-knight", name: "Grave Knight", text: "Heavy oathbound crawler with durable melee stats." },
]
const modeOptions: Array<{ id: MultiplayerMode; name: string; text: string }> = [
  { id: "solo", name: "Solo", text: "One crawl, local run." },
  { id: "coop", name: "Co-op", text: "Shared dungeon host. Friends progress together." },
  { id: "race", name: "Race", text: "Same seed, separate runs. Fastest descent wins." },
]
const multiplayerModeOptions = modeOptions.filter((option) => option.id !== "solo")
const settingTabs = [
  { id: "profile", name: "Profile", description: "Identity, cloud, and overlays" },
  { id: "run", name: "Run", description: "Current world, seed, save, and asset details" },
  { id: "access", name: "Access", description: "Controls and readability" },
  { id: "visuals", name: "Visuals", description: "Camera, dice, and screen motion" },
  { id: "audio", name: "Audio", description: "Stored audio preferences" },
] as const

const tutorialTabs = [
  {
    name: "Movement",
    description: "Moving, visibility, traps, and floors",
    body: [
      "Move with arrows or your selected WASD/Vim scheme. Each legal move advances the turn, reveals nearby cells, and lets alert enemies react.",
      "Walls and void block movement. Doors can hide secret rooms, notes and other collectibles add Book entries, traps fire once then become floor, and stairs advance the run unless a final guardian is still alive.",
      "Each new descent uses a seed, floor number, floor modifier, and biome anchors, so replaying a seed is deterministic while a fresh seed changes the map.",
    ],
  },
  {
    name: "Combat",
    description: "Initiative, d20 rolls, targets, and skills",
    body: [
      "Bumping an enemy starts initiative. Tab or left/right changes target, up/down changes skill, number keys pick skills directly, and Enter rolls the selected d20 attack.",
      "Skills check a named stat plus level against a DC. Critical 20s hit, natural 1s fail, focus costs gate stronger skills, and area skills can pressure a whole room.",
      "Enemies answer after your action. Guarded reduces incoming damage, weakened lowers enemy damage, burning chips targets, and F rolls a flee check when a fight gets bad.",
    ],
  },
  {
    name: "Stats",
    description: "Classes, level growth, focus, and XP",
    body: [
      "Classes start with different stat lines, inventory, portraits, weapons, and growth curves. Strength, dexterity, intelligence, faith, mind, endurance, and luck all feed checks.",
      "Kills award XP. Leveling grows class stats, max HP, max focus, and combat modifiers, so the same dungeon feels different between a warden, arcanist, ranger, or support class.",
      "Resting restores focus outside combat. Floor modifiers can change vision, trap damage, rest value, and loot pressure for that floor.",
    ],
  },
  {
    name: "Items",
    description: "Inventory, checks, gold, and equipment",
    body: [
      "Open inventory with I. Use arrows or mouse drag to inspect and reorder slots. Enter applies usable items such as healing vials and potions.",
      "Chests, relics, and vials can trigger talent checks. Roll the prompted stat to claim better rewards, avoid damage, or add lore and quest progress.",
      "Gold comes from caches, merchants, and floor rewards. Merchant NPCs can sell deterministic trade items when you have enough gold.",
    ],
  },
  {
    name: "Book",
    description: "Memory, notes, NPC clues, and discoveries",
    body: [
      "Open the Book with B. It stores what the crawler knows: recovered memories, physical notes, recipes, tool parts, village deeds, rare fossils, boss memories, keepsakes, NPC advice, and hub rumors.",
      "Walking over collectible tiles, talking to NPCs, and resolving note-like checks can add entries. The Book is the long-term way to understand why the player woke with no memory.",
      "Later physical notes, village trust, portal-room upgrades, and AI-admin story changes should all write readable entries here.",
    ],
  },
  {
    name: "Quests",
    description: "World events, NPCs, and generated hooks",
    body: [
      "J opens the quest journal, or O when Vim movement is active. Each quest links to generated world events anchored to rooms, biomes, and floors.",
      "Friendly NPCs open conversation instead of combat. Talking to cartographers, surgeons, shrine keepers, jailers, and merchants can advance quest or lore events.",
      "The minimap marks the focused quest objective when it can be mapped to this floor. Completed events update world progress and can queue later AI-admin milestones.",
      "M opens the full dungeon map with total room, enemy, hidden-artifact, acquired-item, and kill counts for the current run.",
    ],
  },
  {
    name: "Hub",
    description: "Portal room, village economy, trust, farming, and mutators",
    body: [
      "After a clear or recovered deed, V opens the portal village. It tracks coins, houses, buildable stations, NPC trust, farm plots, prepared food, upgraded weapons, and run mutators.",
      "Sell dungeon loot into village coins, then build the quarry, blacksmith, kitchen, storage, farm plots, and upgrade bench. Stations unlock stronger preparation without making the run risk-free.",
      "Trust grows through village quests, keepsakes, selling, farming, and station work. Multiplayer runs use one shared village with multiple houses so co-op can grow a settlement, not just clear rooms.",
    ],
  },
  {
    name: "Saves",
    description: "Manual saves, autosaves, backups, and quit flow",
    body: [
      "Ctrl+S or F5 writes a manual local save. The title Save screen lets you load, rename, delete, and inspect thumbnails for local runs.",
      "Autosave keeps one rolling slot after important run changes and on a timer while you play. It is separate from manual saves so quick recovery stays simple.",
      "If you close a run with newer changes than the last manual save, the game asks whether to Save & Close, Close Anyway, or Cancel.",
    ],
  },
  {
    name: "Cloud",
    description: "Internet checks, auth, sync, and multiplayer buttons",
    body: [
      "The title screen checks internet reachability. Multiplayer and cloud login stay disabled while offline or still checking, so local play remains the default.",
      "Auth sessions live outside save files. Cloud save upload and AI-admin world persistence depend on account status, token health, and the server setup check.",
      "Race mode keeps the same seed for replayable comparison. Co-op, cloud saves, and AI-admin features should be tested through internet-aware paths before enabling them.",
    ],
  },
] as const

export function tutorialTabCount() {
  return tutorialTabs.length
}

const settingsOptions = [
  { id: "username", tab: "profile", name: "Player name", text: "Saved locally and later used by cloud sync.", control: "input" },
  { id: "showUi", tab: "profile", name: "Show UI", text: "Default overlay visibility for future runs.", control: "switch" },
  { id: "showMinimap", tab: "profile", name: "Show minimap", text: "Default minimap visibility with quest objective marker.", control: "switch" },
  { id: "runSeed", tab: "run", name: "Seed", text: "World seed for replaying this crawl.", control: "readonly" },
  { id: "runMode", tab: "run", name: "Mode", text: "Current multiplayer/run mode.", control: "readonly" },
  { id: "runFloor", tab: "run", name: "Floor", text: "Current floor and final floor target.", control: "readonly" },
  { id: "runTurn", tab: "run", name: "Turn", text: "Turns taken in this run.", control: "readonly" },
  { id: "runAssets", tab: "run", name: "Assets", text: "Runtime art source for dungeon sprites.", control: "readonly" },
  { id: "runSaves", tab: "run", name: "Saves", text: "Local save directory for this profile.", control: "readonly" },
  { id: "controlScheme", tab: "access", name: "Control scheme", text: "Movement and menu navigation preference.", control: "tabs" },
  { id: "highContrast", tab: "access", name: "High contrast", text: "Brighter borders and selected states.", control: "switch" },
  { id: "reduceMotion", tab: "access", name: "Reduce motion", text: "Quieter background and dice movement.", control: "switch" },
  { id: "tileScale", tab: "visuals", name: "Camera FOV", text: "Wide shows more rooms; close keeps sprite detail.", control: "slider" },
  { id: "diceSkin", tab: "visuals", name: "Dice skin", text: "Faceted polyhedral dice color used in combat rolls.", control: "tabs" },
  { id: "backgroundFx", tab: "visuals", name: "Background FX", text: "How much title-screen dungeon rain appears.", control: "slider" },
  { id: "music", tab: "audio", name: "Music", text: "Stored for the future audio layer.", control: "switch" },
  { id: "sound", tab: "audio", name: "SFX", text: "Stored for combat and loot feedback later.", control: "switch" },
] as const
type SettingOption = (typeof settingsOptions)[number]

const UI = {
  bg: "#071014",
  ink: "#d8dee9",
  muted: "#66717d",
  soft: "#8f9ba8",
  panel: "#101820",
  panel2: "#16212b",
  panel3: "#1e2d38",
  edge: "#35414b",
  edgeDim: "#242e37",
  edgeHot: "#f0c65a",
  cyan: "#49d5ff",
  ruby: "#ff5e86",
  violet: "#c675ff",
  glow: "#fff0a6",
  gold: "#f4d06f",
  brass: "#d6a85c",
  hp: "#d56b8c",
  hpBack: "#2b141f",
  focus: "#7dffb2",
  focusBack: "#123223",
  shadow: "#05090c",
}
const cleanPanel = "#101820"
const cleanPanel2 = "#15212b"
const cleanPanel3 = "#1b2a35"
const cleanLine = "#35424d"
const cleanLineHot = "#d6a85c"
const mapCollectibleTiles = new Set<TileId>(["potion", "relic", "chest", "note", "recipe", "tool", "deed", "fossil", "boss-memory", "keepsake", "story-relic"])

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
  const canvas = new Canvas(width, height, "#111820", UI.bg)
  if (model.screen === "start") drawStart(canvas, model)
  if (model.screen === "character") drawCharacter(canvas, model)
  if (model.screen === "mode") drawMode(canvas, model)
  if (model.screen === "saves") drawSaves(canvas, model)
  if (model.screen === "cloud") drawCloud(canvas, model)
  if (model.screen === "settings") drawSettings(canvas, model)
  if (model.screen === "controls") drawControls(canvas, model)
  if (model.screen === "tutorial") drawTutorial(canvas, model)
  if (model.screen === "game") drawGame(canvas, model)
  if (model.screen === "village") drawVillage(canvas, model)
  if (model.dialog) drawDialog(canvas, model)
  if (model.screenTransition) drawScreenTransition(canvas, model.screenTransition)

  return canvas
}

export function currentStartItem(model: AppModel) {
  return startItems[model.menuIndex]
}

export function currentClass(model: AppModel) {
  return classOptions[model.classIndex] ?? classOptions[2]
}

export function currentMode(model: AppModel) {
  return modeOptions[model.modeIndex] ?? modeOptions[0]
}

export function multiplayerModeForSelection(index: number) {
  return multiplayerModeOptions[wrap(index, multiplayerModeOptions.length)] ?? multiplayerModeOptions[0]
}

export function multiplayerSelectionIndexForMode(mode: MultiplayerMode) {
  const index = multiplayerModeOptions.findIndex((option) => option.id === mode)
  return index >= 0 ? index : 0
}

export function currentSettingItem(model: AppModel) {
  return currentSettingsOptions(model)[model.settingsIndex] ?? currentSettingsOptions(model)[0] ?? settingsOptions[0]
}

export function currentStartItemDisabled(model: AppModel) {
  return startItemDisabled(currentStartItem(model), model)
}

export function moveSettingsTab(model: AppModel, delta: number) {
  model.settingsTabIndex = wrap(model.settingsTabIndex + delta, settingTabs.length)
  model.settingsIndex = 0
  model.menuIndex = 0
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
        ? multiplayerModeOptions.length
        : model.screen === "cloud"
          ? 3
          : model.screen === "tutorial"
            ? tutorialTabs.length
          : model.screen === "settings"
            ? currentSettingsOptions(model).length
            : startItems.length
  model.menuIndex = wrap(model.menuIndex + delta, count)
  if (model.screen === "character") model.classIndex = model.menuIndex
  if (model.screen === "mode") model.modeIndex = modeOptions.findIndex((option) => option.id === multiplayerModeForSelection(model.menuIndex).id)
  if (model.screen === "settings") model.settingsIndex = model.menuIndex
}

function currentSettingsOptions(model: AppModel): SettingOption[] {
  const tab = settingTabs[model.settingsTabIndex]?.id ?? settingTabs[0].id
  return settingsOptions.filter((option) => option.tab === tab)
}

function centeredPanelBounds(canvas: Canvas, maxWidth: number, maxHeight: number, xPadding = 8, yPadding = 6): PanelBounds {
  const width = Math.min(maxWidth, canvas.width - xPadding)
  const height = Math.min(maxHeight, canvas.height - yPadding)
  return {
    x: Math.floor((canvas.width - width) / 2),
    y: Math.max(2, Math.floor((canvas.height - height) / 2)),
    width,
    height,
  }
}

function drawStart(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed, model.settings)
  const width = Math.min(86, canvas.width - 8)
  const x = Math.floor((canvas.width - width) / 2)
  const compact = canvas.height < 30
  const brandY = compact ? 3 : Math.max(3, Math.floor(canvas.height * 0.23))
  const brandHeight = compact ? drawCompactBrand(canvas, brandY, width) : drawBrand(canvas, x, brandY, width, UI.bg)

  const cardW = Math.min(76, width)
  const cardX = Math.floor((canvas.width - cardW) / 2)
  const listY = compact ? brandY + brandHeight + 2 : brandY + brandHeight + 5
  const rowH = compact || canvas.height < 34 ? 1 : 2
  const visibleRows = Math.max(4, Math.min(startItems.length, Math.floor((canvas.height - listY - 4) / rowH)))
  const offset = scrollOffset(model.menuIndex, visibleRows, startItems.length)
  startItems.slice(offset, offset + visibleRows).forEach((item, visibleIndex) => {
    const index = offset + visibleIndex
    const selected = model.menuIndex === index
    drawStartMenuRow(canvas, cardX, listY + visibleIndex * rowH, cardW, rowH, item, selected, startItemDisabled(item, model))
  })
  if (offset > 0) canvas.write(cardX + cardW - 4, listY - 1, "↑", UI.muted, UI.bg)
  if (offset + visibleRows < startItems.length) canvas.write(cardX + cardW - 4, listY + visibleRows * rowH, "↓", UI.muted, UI.bg)

  if (model.saveStatus && canvas.height > 30) canvas.center(canvas.height - 5, trim(model.saveStatus, canvas.width - 4), UI.focus, UI.bg)
  drawTitleVersionStatus(canvas, model)
  drawFooter(canvas, [
    ["Enter", "select"],
    ["↑↓", "navigate"],
    ["n", "new seed"],
    ["t", "tutorial"],
    ["?", "help"],
    ["q", "quit"],
  ])
}

function drawStartMenuRow(canvas: Canvas, x: number, y: number, width: number, height: number, labelText: string, selected: boolean, disabled: boolean) {
  const bg = selected ? cleanPanel2 : undefined
  const fg = disabled ? UI.muted : selected ? UI.gold : UI.ink
  const hint = selected ? startMenuHint(labelText) : ""
  const lineY = y + (height > 1 ? 1 : 0)
  if (selected) canvas.fill(x, y, width, height, " ", cleanPanel2, cleanPanel2)
  writeCentered(canvas, x, lineY, width, trim(labelText, Math.max(4, width - 28)), fg, bg)
  if (hint) canvas.write(x + Math.max(18, width - hint.length - 5), lineY, hint, disabled ? UI.muted : UI.focus, bg)
}

function startMenuHint(item: string) {
  if (item === "New descent") return "play"
  if (item === "Continue last") return "continue"
  if (item === "Load save") return "manage"
  if (item === "Character") return "crawler"
  if (item === "Multiplayer") return "online"
  if (item === "Cloud login") return "sync"
  if (item === "Tutorial") return "learn"
  if (item === "Settings") return "tune"
  if (item === "Controls") return "keys"
  return ""
}

function drawTitleVersionStatus(canvas: Canvas, model: AppModel) {
  const versionText = `v${model.currentVersion}`
  const updateNotice = titleUpdateNotice(model.updateStatus)
  canvas.write(1, canvas.height - 1, trim(versionText, Math.max(0, canvas.width - 2)), UI.muted, UI.bg)
  if (updateNotice && canvas.height >= 7) canvas.write(1, canvas.height - 3, trim(updateNotice, canvas.width - 2), UI.gold, UI.bg)
}

function drawCharacter(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 2, model.settings)
  const { x, y, width, height } = centeredPanelBounds(canvas, 90, 28)
  drawPanel(canvas, x, y, width, height, "Choose Your Crawler", UI.gold)

  const editingName = model.inputMode?.field === "characterName"
  const shownName = editingName ? `${model.inputMode?.draft ?? ""}_` : model.session.hero.name
  drawInputField(canvas, x + 4, y + 3, width - 8, "Name", shownName, editingName)
  const selectedAppearance = normalizeHeroAppearance(currentClass(model).id, model.session.hero.appearance)
  canvas.write(x + 4, y + 5, trim(appearanceLabel(selectedAppearance), width - 8), UI.soft, UI.panel)

  const listY = y + 7
  const visibleRows = clamp(Math.floor((height - 10) / 4), 3, classOptions.length)
  const rowStep = 4
  const cardH = 4
  const textX = x + 22
  const offset = scrollOffset(model.classIndex, visibleRows, classOptions.length)
  classOptions.slice(offset, offset + visibleRows).forEach((option, visibleIndex) => {
    const index = offset + visibleIndex
    const selected = model.classIndex === index
    const row = listY + visibleIndex * rowStep
    const bg = selected ? UI.panel3 : UI.panel2
    drawSelectCard(canvas, x + 3, row - 1, width - 6, cardH, selected)
    drawMiniIcon(canvas, x + 7, row, classOptionIcon(option.id), 10, 3, selected ? 1 : 0.7)
    canvas.write(textX, row, `${selected ? ">" : " "} ${option.name}`, selected ? UI.gold : UI.ink, bg)
    canvas.write(textX + 2, row + 1, trim(option.text, width - (textX - x) - 7), selected ? UI.ink : UI.soft, bg)
    if (selected && row + 3 < y + height - 2) canvas.write(textX + 2, row + 3, trim(statLine(statsForClass(option.id)), width - (textX - x) - 7), UI.muted, bg)
    if (selected && row + 4 < y + height - 2) canvas.write(textX + 2, row + 4, trim(startingLoadout(option.id).join(" / "), width - (textX - x) - 7), UI.soft, bg)
  })
  if (classOptions.length > visibleRows) drawScrollbar(canvas, x + width - 5, listY - 1, visibleRows * rowStep, offset, visibleRows, classOptions.length)

  drawFooter(canvas, [
    ["n", "name"],
    ["[ ]", "palette"],
    ["p", "portrait"],
    ["w", "weapon"],
    ["a", "motion"],
    ["Enter", "confirm"],
    ["Esc", "title"],
  ])
}

function drawMode(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 4, model.settings)
  const { x, y, width, height } = centeredPanelBounds(canvas, 86, 22)
  drawPanel(canvas, x, y, width, height, "Multiplayer", UI.gold)
  drawD20Sprite(canvas, x + 5, y + 4, 20, d20FrameCount() - 1, 10, 5, model.settings.diceSkin)

  multiplayerModeOptions.forEach((option, index) => {
    const selected = model.menuIndex === index
    const row = y + 4 + index * 4
    const rowX = x + 18
    if (selected) drawSelectCard(canvas, rowX - 2, row - 1, width - 24, 3, true)
    canvas.write(rowX, row, `${selected ? ">" : " "} ${option.name}`, selected ? UI.gold : UI.ink, selected ? UI.panel3 : UI.panel)
    canvas.write(rowX + 4, row + 1, option.text, selected ? UI.ink : UI.soft, selected ? UI.panel3 : UI.panel)
  })

  const selectedMode = multiplayerModeForSelection(model.menuIndex)
  canvas.write(x + 4, y + height - 5, "Solo runs start from New descent on the title screen.", UI.muted, UI.panel)
  canvas.write(x + 4, y + height - 4, `Host lobby: bun run host -- --mode ${selectedMode.id} --seed ${model.seed}`, UI.soft, UI.panel)
  canvas.write(x + 4, y + height - 3, "Friends reuse the shared seed for co-op or race runs.", UI.muted, UI.panel)
  drawFooter(canvas, [
    ["Enter", "start"],
    ["Esc", "title"],
  ])
}

function drawSaves(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 8, model.settings)
  const { x, y, width, height } = centeredPanelBounds(canvas, 108, 30)
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
      canvas.write(listX + 9, rowY + 1, trim(`${selected ? ">" : " "} ${save.name}`, listW - 24), selected ? UI.gold : UI.ink, selected ? UI.panel3 : UI.panel2)
      canvas.write(listX + listW - 13, rowY + 1, `LV ${save.level}`, UI.brass, selected ? UI.panel3 : UI.panel2)
      canvas.write(listX + 9, rowY + 2, trim(`${save.slot}  ${formatSaveTime(save.savedAt)}`, listW - 13), UI.muted, selected ? UI.panel3 : UI.panel2)
      canvas.write(listX + listW - 11, rowY + 2, save.status, statusColor(save.status), selected ? UI.panel3 : UI.panel2)
    })
  }

  const detailX = listX + listW + 4
  const detailW = Math.max(28, width - (detailX - x) - 4)
  const detailHeight = Math.max(9, height - 11)
  const selected = model.saves[model.saveIndex]
  drawPanel(canvas, detailX, listY - 3, detailW, detailHeight, "Save Detail", selected ? UI.gold : UI.edge)

  if (selected) {
    const renaming = model.inputMode?.field === "saveName"
    if (selected.thumbnail?.length) drawSaveThumbnail(canvas, detailX + 3, listY, selected.thumbnail)
    else drawPixelBlock(canvas, detailX + 3, listY, animatedPixelSprite(classSprite(selected.classId as HeroClass), "idle", selected.turn, 13, 6), 1)
    canvas.write(detailX + 19, listY, trim(selected.heroName, detailW - 22), UI.ink, UI.panel)
    canvas.write(detailX + 19, listY + 1, trim(selected.heroTitle, detailW - 22), UI.soft, UI.panel)
    canvas.write(detailX + 19, listY + 2, trim(renaming ? `Rename: ${model.inputMode?.draft ?? ""}_` : selected.name, detailW - 22), renaming ? UI.gold : UI.soft, UI.panel)
    canvas.write(detailX + 19, listY + 3, `Floor ${selected.floor}/${selected.finalFloor}   Turn ${selected.turn}`, UI.gold, UI.panel)
    canvas.write(detailX + 19, listY + 4, `Mode ${selected.mode}   Seed ${selected.seed}`, UI.brass, UI.panel)

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
    ["e", "rename"],
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
  const shownName = githubName || "not set"
  const auth = authStatusReport()
  const cloudBrowser = buildCloudSaveBrowserState(model.saves, [], auth)

  drawInputField(canvas, x, inputY + 1, width, "GitHub", editing ? `${githubName}_` : shownName, editing)

  const statusY = inputY + 5
  canvas.center(statusY, trim(formatAuthStatus(auth), width), auth.kind === "expired" ? UI.ruby : auth.kind === "expiring" ? UI.gold : UI.soft, UI.bg)

  const rowY = inputY + (compact ? 7 : 8)
  drawPlainSelectRow(
    canvas,
    x,
    rowY,
    width,
    "Sign in with GitHub",
    model.menuIndex === 0,
    auth.loggedIn ? `status ${auth.kind}; refresh ${auth.canRefresh ? "ready" : "missing"}` : model.settings.githubUsername ? `profile @${model.settings.githubUsername}` : "enter username first",
  )
  drawPlainSelectRow(canvas, x, rowY + 2, width, "Keep saves local", model.menuIndex === 1, "turn off cloud sync")
  drawPlainSelectRow(canvas, x, rowY + 4, width, "Back to title", model.menuIndex === 2, "return without syncing")

  if (!compact) {
    const warning = cloudBrowser.errors[0] ?? "Cloud sync will use encrypted save envelopes and conflict prompts."
    const saveRows = cloudBrowser.rows.length ? `${cloudBrowser.rows.length} save${cloudBrowser.rows.length === 1 ? "" : "s"} ready for encrypted sync` : "No local saves to sync yet"
    canvas.center(rowY + 8, trim(warning, width), auth.warnings.length ? UI.gold : UI.soft, UI.bg)
    canvas.center(rowY + 10, trim(`${cloudBrowser.accountStatus}: ${saveRows}`, width), UI.soft, UI.bg)
    canvas.center(rowY + 12, trim(`Local profile: ${profilePath()}`, width), UI.muted, UI.bg)
    canvas.center(rowY + 14, trim(aiAdminStatusLine(model, auth.syncAvailable), width), model.internetStatus === "online" ? UI.focus : UI.gold, UI.bg)
  }
  drawFooter(canvas, [
    ["Enter", "confirm"],
    ["u", "edit name"],
    ["Esc", "title"],
  ])
}

function aiAdminStatusLine(model: AppModel, syncAvailable: boolean) {
  const net = model.internetStatus === "online" ? "online" : model.internetStatus === "checking" ? "checking internet" : "offline"
  const account = syncAvailable ? "account ready" : "local-only account"
  const world = model.session.pendingWorldGeneration ? "world generation pending" : "world script local"
  return `AI Admin: ${net}; ${account}; ${world}`
}

function drawSaveThumbnail(canvas: Canvas, x: number, y: number, thumbnail: string[]) {
  const rows = thumbnail.slice(0, 6)
  for (const [rowIndex, row] of rows.entries()) {
    canvas.write(x, y + rowIndex, trim(row, 13), UI.muted, UI.panel)
  }
}

function drawSettings(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 16, model.settings)
  const { x, y, width, height } = centeredPanelBounds(canvas, 104, 30)
  drawPanel(canvas, x, y, width, height, "Settings", model.settings.highContrast ? UI.focus : UI.gold)

  const listX = x + 4
  const tabY = y + 3
  const tabWidth = width - 8
  drawTabSelect(canvas, listX, tabY, tabWidth, settingTabs, model.settingsTabIndex)
  const activeTab = settingTabs[model.settingsTabIndex] ?? settingTabs[0]
  const options = currentSettingsOptions(model)
  const listY = y + 8
  const listW = Math.min(50, Math.floor(width * 0.52))
  const rowGap = 3
  const visibleRows = Math.max(3, Math.min(options.length, Math.floor((height - 12) / rowGap)))
  const offset = scrollOffset(model.settingsIndex, visibleRows, options.length)
  drawScrollbar(canvas, listX + listW + 1, listY, visibleRows * rowGap - 1, offset, visibleRows, options.length)
  options.slice(offset, offset + visibleRows).forEach((option, visibleIndex) => {
    const index = offset + visibleIndex
    const selected = model.settingsIndex === index
    const rowY = listY + visibleIndex * rowGap
    drawSettingsOption(canvas, listX, rowY, listW, option, model, selected)
  })
  if (offset > 0) canvas.write(listX + listW - 3, listY - 1, "↑", UI.muted, UI.panel)
  if (offset + visibleRows < options.length) canvas.write(listX + listW - 3, listY + visibleRows * rowGap, "↓", UI.muted, UI.panel)

  const detailX = listX + listW + 4
  const detailW = width - (detailX - x) - 4
  const detailH = Math.min(17, height - 12)
  drawPanel(canvas, detailX, listY, detailW, detailH, activeTab.name, UI.edge)
  if (activeTab.id === "run") {
    drawMiniIcon(canvas, detailX + 3, listY + 3, "map", 8, 3)
    if (detailH > 7) drawSettingRow(canvas, detailX + 3, listY + 7, detailW - 6, "Seed", String(model.session.seed))
    if (detailH > 9) drawSettingRow(canvas, detailX + 3, listY + 9, detailW - 6, "World", model.session.world.worldId)
    if (detailH > 11) drawSettingRow(canvas, detailX + 3, listY + 11, detailW - 6, "Run", `${model.session.mode} floor ${model.session.floor}/${model.session.finalFloor}`)
    if (detailH > 13) drawSettingRow(canvas, detailX + 3, listY + 13, detailW - 6, "Assets", activeAssetPack.name)
    if (detailH > 15) canvas.write(detailX + 3, listY + 15, "Run facts live here now so the play HUD can stay quiet.", UI.soft, UI.panel)
  } else {
    drawMiniIcon(canvas, detailX + 3, listY + 3, "focus-gem", 8, 3)
    if (detailW > 28 && detailH > 7) drawD20Sprite(canvas, detailX + detailW - 15, listY + 3, 20, d20FrameCount() - 1, 10, 4, model.settings.diceSkin)
    const editing = model.inputMode?.field === "username"
    const name = editing ? `${model.inputMode?.draft ?? ""}_` : `@${model.settings.username}`
    if (detailH > 8) drawInputField(canvas, detailX + 3, listY + 7, detailW - 6, "Player", name, editing)
    if (detailH > 11) drawSettingRow(canvas, detailX + 3, listY + 10, detailW - 6, "Profile", profilePath())
    if (detailH > 13) drawSettingRow(canvas, detailX + 3, listY + 12, detailW - 6, "Saves", saveDirectory())
    if (detailH > 15) canvas.write(detailX + 3, listY + 14, "Settings save immediately to the local profile.", UI.soft, UI.panel)
  }

  drawFooter(canvas, [
    ["Enter", "change"],
    ["←→", "tabs"],
    ["u", "edit name"],
    ["c", "controls"],
    ["Esc", model.settingsReturnScreen === "game" ? "game" : "title"],
  ])
}

function drawControls(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 18, model.settings)
  const { x, y, width, height } = centeredPanelBounds(canvas, 96, 28)
  drawPanel(canvas, x, y, width, height, "Controls & Accessibility", UI.gold)

  const rows = [
    ["Move", controlMoveText(model.settings.controlScheme)],
    ["Menus", "Arrows always work. WASD follows the selected control scheme."],
    ["Combat", "Tab selects an enemy. 1-6 selects a skill. Enter rolls d20. F flees."],
    ["Inventory", "I opens pack. Arrows select. Enter applies. Mouse can drag slots."],
    ["Book", "B opens memory, note, NPC, tutorial, and hub discoveries."],
    ["Quests", "J opens the quest journal. Use O instead when Vim movement is active."],
    ["Map", "M opens the full dungeon map and current run stats."],
    ["Run", "R rests outside combat. Esc pauses. Save manager is inside Pause."],
    ["Accessibility", accessibilitySummary(model.settings)],
    ["Visuals", `Camera ${model.settings.tileScale}. UI ${onOff(model.settings.showUi)}. Dice ${diceSkinName(model.settings.diceSkin)}.`],
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

function drawTutorial(canvas: Canvas, model: AppModel) {
  drawDungeonBackdrop(canvas, model.seed + 20, model.settings)
  const { x, y, width, height } = centeredPanelBounds(canvas, 104, 32)
  drawPanel(canvas, x, y, width, height, "Tutorial", UI.gold)

  const activeIndex = clamp(model.tutorialIndex, 0, tutorialTabs.length - 1)
  const active = tutorialTabs[activeIndex] ?? tutorialTabs[0]
  const listX = x + 4
  const listY = y + 4
  const listW = Math.min(30, Math.max(22, Math.floor(width * 0.32)))
  const rowH = 2
  const visibleRows = Math.max(4, Math.min(tutorialTabs.length, Math.floor((height - 9) / rowH)))
  const offset = scrollOffset(activeIndex, visibleRows, tutorialTabs.length)

  canvas.write(listX, y + 3, "Mechanics", UI.brass, UI.panel)
  tutorialTabs.slice(offset, offset + visibleRows).forEach((tab, visibleIndex) => {
    const index = offset + visibleIndex
    const selected = index === activeIndex
    const rowY = listY + visibleIndex * rowH
    const bg = selected ? cleanPanel3 : cleanPanel2
    canvas.fill(listX, rowY, listW, 2, " ", bg, bg)
    if (selected) canvas.fill(listX, rowY, 1, 2, " ", UI.gold, UI.gold)
    canvas.write(listX + 2, rowY, trim(tab.name, listW - 4), selected ? UI.gold : UI.ink, bg)
    canvas.write(listX + 2, rowY + 1, trim(tab.description, listW - 4), selected ? UI.soft : UI.muted, bg)
  })
  drawScrollbar(canvas, listX + listW + 1, listY, visibleRows * rowH, offset, visibleRows, tutorialTabs.length)

  const detailX = listX + listW + 4
  const detailW = width - (detailX - x) - 4
  const detailH = height - 9
  drawPanel(canvas, detailX, listY - 1, detailW, detailH, active.name, UI.edge)
  canvas.write(detailX + 3, listY + 1, trim(active.description, detailW - 6), UI.brass, UI.panel)
  writeWrapped(canvas, detailX + 3, listY + 4, detailW - 6, active.body, detailH - 7, UI.ink, UI.panel)

  if (model.saveStatus && height > 24) canvas.write(x + 4, y + height - 4, trim(model.saveStatus, width - 8), UI.focus, UI.panel)
  drawFooter(canvas, [
    ["↑↓", "tabs"],
    ["Enter", "title"],
    ["Esc", "title"],
  ])
}

function drawGame(canvas: Canvas, model: AppModel) {
  const session = model.session
  const moveAnimation = activePlayerMoveAnimation(model)
  drawMap(canvas, session, model.debugView, model.settings, model.animationFrame, moveAnimation, model.cameraFocus ?? null)
  if (!model.uiHidden) {
    drawHud(canvas, session)
    if (!model.debugView && model.settings.showMinimap) drawMinimap(canvas, session)
    if (!model.debugView) drawQuickbar(canvas, session, model.diceRollAnimation, model.settings)
    if (session.combat.active) drawCombatPanel(canvas, session, model.diceRollAnimation, model.settings)
    if (session.conversation && !session.combat.active && !session.skillCheck) drawConversationPanel(canvas, session)
    drawToasts(canvas, session)
  }
  if (session.status !== "running") drawRunEnd(canvas, session)
  if (session.skillCheck) drawSkillCheckModal(canvas, session, model.diceRollAnimation, model.settings)
  if (session.levelUp) drawLevelUpModal(canvas, session)
  drawUiToggleHint(canvas, model.uiHidden)
}

function drawVillage(canvas: Canvas, model: AppModel) {
  const session = model.session
  const hub = session.hub
  drawDungeonBackdrop(canvas, session.seed + 80, model.settings)
  const { x, y, width, height } = centeredPanelBounds(canvas, 116, 36)
  drawPanel(canvas, x, y, width, height, "Village", UI.focus)

  const mapX = x + 4
  const mapY = y + 4
  const mapW = Math.min(62, Math.floor(width * 0.58))
  const mapH = Math.min(24, height - 9)
  drawPanel(canvas, mapX, mapY, mapW, mapH, "Walkable Village", UI.edge)
  drawVillageMap(canvas, model, mapX + 2, mapY + 2, mapW - 4, mapH - 4)

  const sideX = mapX + mapW + 3
  const sideW = width - (sideX - x) - 4
  const selected = villageLocations[hub.village.selectedLocation]
  drawPanel(canvas, sideX, mapY, sideW, 7, selected.label, UI.gold)
  canvas.write(sideX + 3, mapY + 2, trim(selected.text, sideW - 6), UI.ink, UI.panel)
  canvas.write(sideX + 3, mapY + 4, trim(`Coins ${hub.coins}  Loot sold ${hub.lootSold}  Pack ${hub.contentPacks.active}`, sideW - 6), UI.soft, UI.panel)
  canvas.write(sideX + 3, mapY + 5, trim(`Farm permissions ${hub.village.sharedFarm.permissions}`, sideW - 6), UI.soft, UI.panel)

  const scheduleY = mapY + 8
  drawPanel(canvas, sideX, scheduleY, sideW, 9, "NPC Schedule", UI.edge)
  hub.village.schedules.slice(0, 5).forEach((schedule, index) => {
    const rowY = scheduleY + 2 + index
    const trust = hub.trust[schedule.npc]
    const color = schedule.available ? UI.ink : UI.muted
    canvas.write(sideX + 3, rowY, trim(trust.name, Math.max(10, sideW - 22)), color, UI.panel)
    canvas.write(sideX + sideW - 17, rowY, trim(villageLocations[schedule.location].label, 14), schedule.available ? UI.gold : UI.muted, UI.panel)
  })

  const marketY = scheduleY + 10
  drawPanel(canvas, sideX, marketY, sideW, Math.max(7, height - (marketY - y) - 5), "Market and Balance", UI.edgeDim)
  const shopLog = hub.village.shopLog[0] ?? "No customer price test yet."
  canvas.write(sideX + 3, marketY + 2, trim(shopLog, sideW - 6), UI.ink, UI.panel)
  const dashboard = hub.balanceDashboard
  canvas.write(sideX + 3, marketY + 4, trim(`Balance ${dashboard.runs} runs  ${session.hero.classId} ${dashboard.classWinRate[session.hero.classId] ?? 0}%`, sideW - 6), UI.soft, UI.panel)
  canvas.write(sideX + 3, marketY + 5, trim(`Gold ${dashboard.averageGold}  Hub coins ${dashboard.averageHubCoins}  Pace ${dashboard.upgradePacing}%`, sideW - 6), UI.soft, UI.panel)
  if (dashboard.notes[0]) canvas.write(sideX + 3, marketY + 6, trim(dashboard.notes[0], sideW - 6), UI.muted, UI.panel)

  if (model.saveStatus) canvas.write(x + 4, y + height - 4, trim(model.saveStatus, width - 8), UI.focus, UI.panel)
  drawFooter(canvas, [
    ["Arrows", "walk"],
    ["Enter", "visit"],
    ["M", "market"],
    ["H", "house"],
    ["P", "farm perms"],
    ["C", "pack"],
    ["B", "balance"],
    ["N", "cutscene"],
    ["Esc", "dungeon"],
  ])
}

function drawVillageMap(canvas: Canvas, model: AppModel, x: number, y: number, width: number, height: number) {
  const hub = model.session.hub
  canvas.fill(x, y, width, height, " ", cleanPanel2, cleanPanel2)
  for (let row = 1; row < height - 1; row += 2) canvas.write(x + 1, y + row, trim(".".repeat(Math.max(0, width - 2)), width - 2), UI.muted, cleanPanel2)
  const cellW = Math.max(2, Math.floor(width / 19))
  const cellH = Math.max(1, Math.floor(height / 10))
  const roads = [
    ["portal", "blacksmith"],
    ["portal", "market"],
    ["portal", "farm"],
    ["portal", "houses"],
    ["portal", "guildhall"],
  ] as const
  roads.forEach(([from, to]) => drawVillageRoad(canvas, x, y, cellW, cellH, villageLocations[from].position, villageLocations[to].position))
  villageLocationIds.forEach((id) => {
    const location = villageLocations[id]
    const px = x + clamp(location.position.x * cellW, 1, width - 3)
    const py = y + clamp(location.position.y * cellH, 1, height - 2)
    const selected = hub.village.selectedLocation === id
    const bg = selected ? cleanPanel3 : cleanPanel2
    canvas.fill(px - 1, py, 3, 1, " ", bg, bg)
    canvas.write(px, py, location.glyph, selected ? UI.gold : UI.focus, bg)
  })
  const playerX = x + clamp(hub.village.player.x * cellW, 1, width - 3)
  const playerY = y + clamp(hub.village.player.y * cellH, 1, height - 2)
  canvas.write(playerX, playerY, "@", UI.hp, cleanPanel3)
}

function drawVillageRoad(canvas: Canvas, x: number, y: number, cellW: number, cellH: number, from: { x: number; y: number }, to: { x: number; y: number }) {
  const startX = x + from.x * cellW
  const startY = y + from.y * cellH
  const endX = x + to.x * cellW
  const endY = y + to.y * cellH
  const stepX = Math.sign(endX - startX)
  const stepY = Math.sign(endY - startY)
  for (let px = startX; px !== endX; px += stepX || 1) canvas.write(px, startY, "·", UI.soft, cleanPanel2)
  for (let py = startY; py !== endY; py += stepY || 1) canvas.write(endX, py, "·", UI.soft, cleanPanel2)
}

function activePlayerMoveAnimation(model: AppModel) {
  const animation = model.playerMoveAnimation
  return animation && Date.now() - animation.startedAt < animation.durationMs ? animation : null
}

function drawMap(
  canvas: Canvas,
  session: GameSession,
  debugView: boolean,
  settings: UserSettings,
  animationFrame = session.turn,
  playerMoveAnimation: PlayerMoveAnimation | null = null,
  cameraFocus: CameraFocus = null,
) {
  const tileSize = mapTileSize(canvas, debugView, settings.tileScale)
  const tileWidth = tileSize.width
  const tileHeight = tileSize.height
  const viewWidth = Math.max(1, Math.ceil(canvas.width / tileWidth))
  const viewHeight = Math.max(4, Math.ceil(canvas.height / tileHeight))
  const center = cameraFocus ?? session.player
  const startX = center.x - Math.floor(viewWidth / 2)
  const startY = center.y - Math.floor(viewHeight / 2)
  const targets = combatTargets(session)
  const selectedTargetId = session.combat.active ? targets[session.combat.selectedTarget]?.id : undefined
  const previewRadius = cameraFocus ? Math.max(4, Math.floor(Math.min(viewWidth, viewHeight) * 0.3)) : 0

  for (let sy = 0; sy < viewHeight; sy++) {
    for (let sx = 0; sx < viewWidth; sx++) {
      const x = startX + sx
      const y = startY + sy
      const point = { x, y }
      const previewVisible = Boolean(cameraFocus && Math.abs(cameraFocus.x - x) + Math.abs(cameraFocus.y - y) <= previewRadius)
      const visible = session.visible.has(pointKey(point)) || previewVisible
      const seen = session.seen.has(pointKey(point)) || previewVisible
      const actor = visible ? actorAt(session.dungeon.actors, point) : undefined
      const screenX = sx * tileWidth
      const screenY = sy * tileHeight

      if (debugView) {
        const style = tileStyle(session, x, y, true, visible, seen)
        drawTileBlock(canvas, screenX, screenY, tileWidth, tileHeight, style)
      } else {
        drawAssetTile(canvas, screenX, screenY, tileWidth, tileHeight, session, x, y, visible, seen)
      }

      if (session.player.x === x && session.player.y === y) {
        drawSprite(
          canvas,
          screenX,
          screenY,
          tileWidth,
          tileHeight,
          classSprite(session.hero.classId, session.hero.appearance),
          debugView,
          playerAnimation(session, Boolean(playerMoveAnimation)),
          playerMoveAnimation ? animationFrame : session.turn,
          playerMoveAnimation?.direction,
        )
      }
      else if (actor) {
        drawSprite(canvas, screenX, screenY, tileWidth, tileHeight, actorSpriteId(actor.kind), debugView, actorAnimation(actor.id === selectedTargetId, session), actor.id === selectedTargetId ? animationFrame : 0)
        if (actor.id === selectedTargetId || (cameraFocus && cameraFocus.x === x && cameraFocus.y === y)) drawTargetFrame(canvas, screenX, screenY, tileWidth, tileHeight, debugView)
      }
      else if (cameraFocus && cameraFocus.x === x && cameraFocus.y === y) {
        drawTargetFrame(canvas, screenX, screenY, tileWidth, tileHeight, debugView)
        canvas.write(screenX + Math.max(1, Math.floor(tileWidth / 2) - 1), screenY + Math.max(1, Math.floor(tileHeight / 2)), "◆", UI.gold)
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

function drawMinimap(canvas: Canvas, session: GameSession) {
  if (canvas.width < 96 || canvas.height < 28) return
  const width = Math.min(38, Math.max(32, Math.floor(canvas.width * 0.22)))
  const availableHeight = canvas.height - gameQuickbarHeight(canvas) - gameHudHeight(canvas) - 4
  const height = Math.min(15, Math.max(11, Math.min(availableHeight, Math.floor(canvas.height * 0.28))))
  const x = 2
  const y = canvas.height - gameQuickbarHeight(canvas) - height - 1
  if (height < 10 || y <= gameHudHeight(canvas) + 1) return

  const bg = "#0b1218"
  canvas.fill(x, y, width, height, " ", bg, bg)
  canvas.border(x, y, width, height, UI.edge)

  const innerX = x + 1
  const innerY = y + 1
  const innerW = width - 2
  const innerH = height - 4
  const objective = activeQuestObjectivePoint(session)
  const startX = session.player.x - Math.floor(innerW / 2)
  const startY = session.player.y - Math.floor(innerH / 2)
  let objectiveVisible = false
  const title = objective ? `Radar  goal ${objectiveDirectionLabel(session.player, objective)}` : "Radar"
  canvas.write(x + 2, y, trim(title, width - 4), UI.gold, bg)

  for (let row = 0; row < innerH; row++) {
    for (let col = 0; col < innerW; col++) {
      const mapX = startX + col
      const mapY = startY + row
      const point = { x: mapX, y: mapY }
      const key = pointKey(point)
      const visible = session.visible.has(key)
      const seen = session.seen.has(key)
      let marker = minimapTileMarker(session.dungeon.tiles[mapY]?.[mapX] ?? "void", visible, seen)
      const actor = visible ? actorAt(session.dungeon.actors, point) : undefined

      if (actor) marker = minimapActorMarker(actor.kind)
      if (objective && objective.x === mapX && objective.y === mapY) {
        marker = { ch: "◆", fg: UI.gold }
        objectiveVisible = true
      }
      if (session.player.x === mapX && session.player.y === mapY) {
        marker = { ch: "@", fg: UI.focus }
      }
      canvas.write(innerX + col, innerY + row, marker.ch, marker.fg, bg)
    }
  }
  if (objective && !objectiveVisible) drawMinimapObjectivePointer(canvas, objective, startX, startY, innerX, innerY, innerW, innerH, bg)
  const detail = objective ? `Goal ${objectiveDistanceText(session.player, objective)}  floor ${session.floor}` : `Floor ${session.floor}`
  canvas.write(x + 1, y + height - 3, trim(detail, width - 2), UI.brass, bg)
  canvas.write(x + 1, y + height - 2, trim("@you !foe nNPC $shop >exit ◆", width - 2), UI.soft, bg)
}

function drawRunMapDialog(canvas: Canvas, model: AppModel, x: number, y: number, width: number, height: number) {
  const session = model.session
  const stats = runMapStats(session)
  const mapX = x + 3
  const mapY = y + 4
  const statsW = Math.min(36, Math.max(28, Math.floor(width * 0.31)))
  const mapW = Math.max(28, width - statsW - 9)
  const mapH = Math.max(10, height - 9)
  const statsX = mapX + mapW + 3

  drawPanel(canvas, mapX, mapY, mapW, mapH, "Full Map", UI.edge)
  drawFullDungeonMap(canvas, session, mapX + 2, mapY + 2, mapW - 4, mapH - 4)

  drawPanel(canvas, statsX, mapY, statsW, mapH, "Run Stats", UI.edgeDim)
  const rows: Array<[string, string, string?]> = [
    ["Floor", `${session.floor}/${session.finalFloor}`, UI.gold],
    ["Rooms", `${stats.roomsSeen}/${stats.roomsTotal}`, UI.ink],
    ["Enemies", `${stats.enemiesRemaining}/${stats.enemyKnownTotal}`, UI.ruby],
    ["Killed", String(session.kills), UI.ruby],
    ["?? hidden", String(stats.hiddenArtifacts), UI.cyan],
    ["Artifacts", `${stats.visibleArtifacts} visible`, UI.cyan],
    ["Acquired", `${stats.acquiredItems} items`, UI.focus],
    ["Book", `${stats.bookEntries} entries`, UI.focus],
    ["Secrets", `${stats.secretsFound}/${stats.secretsTotal}`, UI.brass],
    ["Gold", String(session.gold), UI.gold],
    ["Turns", String(session.turn), UI.soft],
    ["XP", `${session.xp}/${session.level * 10}`, UI.soft],
  ]

  rows.slice(0, Math.max(0, mapH - 6)).forEach(([labelText, value, color], index) => {
    drawMapStatRow(canvas, statsX + 2, mapY + 2 + index, statsW - 4, labelText, value, color ?? UI.ink)
  })

  const objective = activeQuestObjectivePoint(session)
  const objectiveText = objective ? `Goal ${objectiveDistanceText(session.player, objective)}` : "Goal none on this floor"
  const legendY = mapY + mapH - 4
  canvas.write(statsX + 2, legendY, trim(objectiveText, statsW - 4), objective ? UI.gold : UI.muted, UI.panel)
  canvas.write(statsX + 2, legendY + 2, trim("@ you  ! enemy  n npc  ? artifact  > exit", statsW - 4), UI.soft, UI.panel)
  canvas.write(x + 4, y + height - 4, trim("M or Esc close. Unseen artifact and secret counts stay as ?? until discovered.", width - 8), UI.muted, UI.panel)
}

function drawMapStatRow(canvas: Canvas, x: number, y: number, width: number, labelText: string, value: string, valueColor: string) {
  canvas.fill(x, y, width, 1, " ", UI.panel2, UI.panel2)
  canvas.write(x + 2, y, trim(labelText, 12), UI.brass, UI.panel2)
  canvas.write(x + 16, y, trim(value, width - 18), valueColor, UI.panel2)
}

function drawFullDungeonMap(canvas: Canvas, session: GameSession, x: number, y: number, width: number, height: number) {
  const bg = "#0b1218"
  canvas.fill(x, y, width, height, " ", bg, bg)
  if (width <= 0 || height <= 0) return

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const bounds = sourceBoundsForMapCell(session, col, row, width, height)
      const marker = fullMapTileMarker(session, bounds)
      canvas.write(x + col, y + row, marker.ch, marker.fg, bg)
    }
  }

  for (const secret of session.dungeon.secrets ?? []) {
    if (!secret.discovered) drawScaledMapPoint(canvas, session, secret.door, x, y, width, height, "?", UI.cyan, bg)
  }
  for (let tileY = 0; tileY < session.dungeon.height; tileY++) {
    for (let tileX = 0; tileX < session.dungeon.width; tileX++) {
      const tile = session.dungeon.tiles[tileY]?.[tileX]
      if (!tile || !mapCollectibleTiles.has(tile)) continue
      const point = { x: tileX, y: tileY }
      drawScaledMapPoint(canvas, session, point, x, y, width, height, fullMapCollectibleMarker(tile, session.seen.has(pointKey(point))), fullMapCollectibleColor(tile, session.seen.has(pointKey(point))), bg)
    }
  }
  for (const actor of session.dungeon.actors) {
    const marker = fullMapActorMarker(actor.kind)
    drawScaledMapPoint(canvas, session, actor.position, x, y, width, height, marker.ch, marker.fg, bg)
  }
  const objective = activeQuestObjectivePoint(session)
  if (objective) drawScaledMapPoint(canvas, session, objective, x, y, width, height, "◆", UI.gold, bg)
  drawScaledMapPoint(canvas, session, session.player, x, y, width, height, "@", UI.focus, bg)
}

function runMapStats(session: GameSession) {
  let visibleArtifacts = 0
  let hiddenArtifacts = 0
  let roomsSeen = 0
  for (let y = 0; y < session.dungeon.height; y++) {
    for (let x = 0; x < session.dungeon.width; x++) {
      const tile = session.dungeon.tiles[y]?.[x]
      if (!tile || !mapCollectibleTiles.has(tile)) continue
      if (session.seen.has(pointKey({ x, y }))) visibleArtifacts += 1
      else hiddenArtifacts += 1
    }
  }
  for (const anchor of session.dungeon.anchors) {
    if (session.seen.has(pointKey(anchor.position))) roomsSeen += 1
  }
  const secretsFound = (session.dungeon.secrets ?? []).filter((secret) => secret.discovered).length
  const secretsHidden = (session.dungeon.secrets ?? []).length - secretsFound
  const enemiesRemaining = session.dungeon.actors.filter((actor) => isEnemyActorId(actor.kind)).length
  const acquiredItems = Math.max(0, session.inventory.length - startingLoadout(session.hero.classId).length)
  const bookEntries = session.knowledge.filter((entry) => entry.kind !== "tutorial").length

  return {
    roomsSeen,
    roomsTotal: session.dungeon.anchors.length,
    enemiesRemaining,
    enemyKnownTotal: enemiesRemaining + session.kills,
    hiddenArtifacts: hiddenArtifacts + secretsHidden,
    visibleArtifacts,
    acquiredItems,
    bookEntries,
    secretsFound,
    secretsTotal: (session.dungeon.secrets ?? []).length,
  }
}

function sourceBoundsForMapCell(session: GameSession, col: number, row: number, width: number, height: number) {
  const startX = Math.floor((col / width) * session.dungeon.width)
  const endX = Math.max(startX + 1, Math.floor(((col + 1) / width) * session.dungeon.width))
  const startY = Math.floor((row / height) * session.dungeon.height)
  const endY = Math.max(startY + 1, Math.floor(((row + 1) / height) * session.dungeon.height))
  return { startX, endX: Math.min(session.dungeon.width, endX), startY, endY: Math.min(session.dungeon.height, endY) }
}

function fullMapTileMarker(session: GameSession, bounds: { startX: number; endX: number; startY: number; endY: number }) {
  let walls = 0
  let floors = 0
  let seen = false
  let visible = false
  let special: TileId | null = null

  for (let y = bounds.startY; y < bounds.endY; y++) {
    for (let x = bounds.startX; x < bounds.endX; x++) {
      const tile = session.dungeon.tiles[y]?.[x] ?? "void"
      const key = pointKey({ x, y })
      seen ||= session.seen.has(key)
      visible ||= session.visible.has(key)
      if (tile === "stairs" || tile === "door" || mapCollectibleTiles.has(tile)) special ??= tile
      else if (tile === "wall" || tile === "void") walls += 1
      else floors += 1
    }
  }

  const dim = visible ? 1 : seen ? 0.68 : 0.46
  if (special === "stairs") return { ch: ">", fg: tint(UI.focus, dim) }
  if (special === "door") return { ch: "+", fg: tint(UI.gold, dim) }
  if (special && mapCollectibleTiles.has(special)) return { ch: seen ? fullMapCollectibleMarker(special, true) : "?", fg: fullMapCollectibleColor(special, seen) }
  if (floors >= walls) return { ch: seen ? "." : "·", fg: tint("#78b28f", dim) }
  return { ch: "#", fg: tint("#87919b", dim) }
}

function drawScaledMapPoint(canvas: Canvas, session: GameSession, point: { x: number; y: number }, x: number, y: number, width: number, height: number, marker: string, fg: string, bg: string) {
  const col = clamp(Math.floor((point.x / Math.max(1, session.dungeon.width - 1)) * (width - 1)), 0, width - 1)
  const row = clamp(Math.floor((point.y / Math.max(1, session.dungeon.height - 1)) * (height - 1)), 0, height - 1)
  canvas.write(x + col, y + row, marker, fg, bg)
}

function fullMapCollectibleMarker(tile: TileId, seen: boolean) {
  if (!seen) return "?"
  if (tile === "potion") return "p"
  if (tile === "chest") return "$"
  if (tile === "relic") return "r"
  if (tile === "recipe") return "R"
  if (tile === "tool") return "t"
  if (tile === "deed") return "d"
  return "?"
}

function fullMapCollectibleColor(tile: TileId, seen: boolean) {
  if (!seen) return UI.cyan
  if (tile === "potion") return UI.focus
  if (tile === "chest") return UI.gold
  if (tile === "relic" || tile === "deed" || tile === "story-relic") return UI.brass
  return UI.cyan
}

function fullMapActorMarker(kind: string) {
  if (isEnemyActorId(kind)) return { ch: "!", fg: UI.ruby }
  if (isNpcActorId(kind)) return { ch: kind === "merchant" ? "$" : "n", fg: kind === "merchant" ? UI.gold : UI.cyan }
  return { ch: "?", fg: UI.soft }
}

function minimapTileMarker(tile: TileId, visible: boolean, seen: boolean) {
  if (!seen && !visible) return { ch: " ", fg: "#101820" }
  const dim = visible ? 1 : 0
  if (tile === "wall") return { ch: "#", fg: dim ? "#a7b0ba" : "#52606b" }
  if (tile === "door") return { ch: "+", fg: dim ? UI.gold : "#7d6b42" }
  if (tile === "stairs") return { ch: ">", fg: dim ? UI.focus : "#4f8d70" }
  if (tile === "trap") return { ch: "^", fg: dim ? UI.hp : "#724654" }
  if (tile === "potion") return { ch: "p", fg: dim ? UI.focus : "#4f8d70" }
  if (tile === "chest") return { ch: "$", fg: dim ? UI.gold : "#7d6b42" }
  if (tile === "relic") return { ch: "r", fg: dim ? UI.brass : "#7d6b42" }
  if (tile === "note" || tile === "recipe" || tile === "tool" || tile === "deed" || tile === "fossil" || tile === "boss-memory" || tile === "keepsake" || tile === "story-relic") {
    return { ch: "?", fg: dim ? UI.cyan : "#466f78" }
  }
  if (tile === "void") return { ch: " ", fg: "#101820" }
  return { ch: visible ? "." : "·", fg: visible ? "#86d9ad" : "#416b5f" }
}

function minimapActorMarker(kind: string) {
  if (isEnemyActorId(kind)) return { ch: "!", fg: UI.hp }
  if (isNpcActorId(kind)) return { ch: kind === "merchant" ? "$" : "n", fg: kind === "merchant" ? UI.gold : UI.cyan }
  return { ch: "?", fg: UI.soft }
}

function drawMinimapObjectivePointer(canvas: Canvas, objective: { x: number; y: number }, startX: number, startY: number, innerX: number, innerY: number, innerW: number, innerH: number, bg: string) {
  const col = clamp(objective.x - startX, 0, innerW - 1)
  const row = clamp(objective.y - startY, 0, innerH - 1)
  canvas.write(innerX + col, innerY + row, "◆", UI.gold, bg)
}

function objectiveDirectionLabel(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const horizontal = dx > 0 ? `E${dx}` : dx < 0 ? `W${Math.abs(dx)}` : ""
  const vertical = dy > 0 ? `S${dy}` : dy < 0 ? `N${Math.abs(dy)}` : ""
  return [horizontal, vertical].filter(Boolean).join(" ") || "here"
}

function objectiveDistanceText(from: { x: number; y: number }, to: { x: number; y: number }) {
  const distance = Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
  return `${objectiveDirectionLabel(from, to)} (${distance} steps)`
}

function activeQuestObjectivePoint(session: GameSession) {
  const quest = session.world.quests.find((candidate) => candidate.status === "active") ?? null
  const candidates =
    quest?.objectiveEventIds
      .flatMap((id) => {
        const event = session.world.events.find((candidate) => candidate.id === id)
        if (!event || event.status === "completed") return []
        const anchor = session.world.anchors.find((candidate) => candidate.id === event.anchorId && candidate.floor === session.floor)
        return anchor ? [anchor.position] : []
      }) ?? []
  return candidates.find((point) => Math.abs(point.x - session.player.x) + Math.abs(point.y - session.player.y) > 0) ?? candidates[0] ?? null
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
  if (tile === "door") canvas.write(screenX + Math.floor(tileWidth / 2), screenY + Math.floor(tileHeight / 2), "+", UI.gold)
  if (tile === "stairs") drawPixelBlock(canvas, screenX, screenY, pixelSprite("stairs", tileWidth, tileHeight), 1)
  if (tile === "potion") drawPixelBlock(canvas, screenX, screenY, pixelSprite("potion", tileWidth, tileHeight), 1)
  if (tile === "relic") drawPixelBlock(canvas, screenX, screenY, pixelSprite("relic", tileWidth, tileHeight), 1)
  if (tile === "chest") drawPixelBlock(canvas, screenX, screenY, pixelSprite("chest", tileWidth, tileHeight), 1)
  if (tile === "note") drawPixelBlock(canvas, screenX, screenY, pixelSprite("scroll", tileWidth, tileHeight), 1)
  if (tile === "recipe") drawPixelBlock(canvas, screenX, screenY, pixelSprite("food", tileWidth, tileHeight), 1)
  if (tile === "tool") drawPixelBlock(canvas, screenX, screenY, pixelSprite("lockpick", tileWidth, tileHeight), 1)
  if (tile === "deed") drawPixelBlock(canvas, screenX, screenY, pixelSprite("map", tileWidth, tileHeight), 1)
  if (tile === "fossil") drawPixelBlock(canvas, screenX, screenY, pixelSprite("gem", tileWidth, tileHeight), 1)
  if (tile === "boss-memory") drawPixelBlock(canvas, screenX, screenY, pixelSprite("focus-gem", tileWidth, tileHeight), 1)
  if (tile === "keepsake") drawPixelBlock(canvas, screenX, screenY, pixelSprite("coin", tileWidth, tileHeight), 1)
  if (tile === "story-relic") drawPixelBlock(canvas, screenX, screenY, pixelSprite("relic", tileWidth, tileHeight), 1)
  if (tile === "trap") canvas.write(screenX + Math.floor(tileWidth / 2), screenY + Math.floor(tileHeight / 2), "^", UI.ruby)
}

function tileStyle(session: GameSession, x: number, y: number, debugView: boolean, visible: boolean, seen: boolean): TileRenderStyle {
  const tile = session.dungeon.tiles[y]?.[x] ?? "void"
  if (debugView) return debugTileStyle(session, x, y)
  if (!seen) return { pattern: ["        ", "        ", "        ", "        "], fg: "#05070a", bg: "#05070a" }
  if (tile === "floor") return floorStyle(x, y, visible)
  if (tile === "wall") return wallStyle(x, y, visible)
  if (tile === "door") return visible ? { pattern: ["        ", "  +--+  ", "  |  |  ", "  +--+  "], fg: "#f4d06f", bg: "#3a2731" } : floorStyle(x, y, false)
  if (tile === "stairs") return visible ? { pattern: ["        ", "  /==\\  ", "  |  |  ", "  \\==/  "], fg: "#2d1d17", bg: "#b4915a" } : floorStyle(x, y, false)
  if (tile === "potion") return visible ? { pattern: ["        ", "        ", "   ●    ", "        "], fg: "#f4a6b8", bg: textureColor(x, y) } : floorStyle(x, y, false)
  if (tile === "relic") return visible ? { pattern: ["        ", "        ", "   ◆    ", "        "], fg: "#f4d06f", bg: textureColor(x, y) } : floorStyle(x, y, false)
  if (tile === "chest") return visible ? { pattern: ["        ", "        ", "  [▤]   ", "        "], fg: "#f4d06f", bg: "#9a6c4e" } : floorStyle(x, y, false)
  if (tile === "note") return visible ? { pattern: ["        ", "   ┌┐   ", "   └?   ", "        "], fg: "#d8c7a1", bg: textureColor(x, y) } : floorStyle(x, y, false)
  if (tile === "recipe") return visible ? { pattern: ["        ", "   %    ", "  /_\\   ", "        "], fg: "#d9b979", bg: textureColor(x, y) } : floorStyle(x, y, false)
  if (tile === "tool") return visible ? { pattern: ["        ", "   &    ", "  -+-   ", "        "], fg: "#9fb4c8", bg: textureColor(x, y) } : floorStyle(x, y, false)
  if (tile === "deed") return visible ? { pattern: ["        ", "  /\\/   ", "  ~~    ", "        "], fg: "#86d9ad", bg: textureColor(x, y) } : floorStyle(x, y, false)
  if (tile === "fossil") return visible ? { pattern: ["        ", "   ff   ", "  /__   ", "        "], fg: "#b8aa90", bg: textureColor(x, y) } : floorStyle(x, y, false)
  if (tile === "boss-memory") return visible ? { pattern: ["        ", "  M M   ", "   ^    ", "        "], fg: "#d56b8c", bg: textureColor(x, y) } : floorStyle(x, y, false)
  if (tile === "keepsake") return visible ? { pattern: ["        ", "  (k)   ", "        ", "        "], fg: "#f0a8b8", bg: textureColor(x, y) } : floorStyle(x, y, false)
  if (tile === "story-relic") return visible ? { pattern: ["        ", "  ?!    ", "  **    ", "        "], fg: "#b48ead", bg: textureColor(x, y) } : floorStyle(x, y, false)
  if (tile === "trap") return visible ? { pattern: ["        ", "        ", "   ^    ", "        "], fg: "#ff5e86", bg: textureColor(x, y) } : floorStyle(x, y, false)
  return { pattern: ["        ", "        ", "        ", "        "], fg: "#05070a", bg: "#05070a" }
}

function debugTileStyle(session: GameSession, x: number, y: number): TileRenderStyle {
  const tile = session.dungeon.tiles[y]?.[x] ?? "void"
  if (tile === "floor") return { pattern: ["··"], fg: "#36595a" }
  if (tile === "wall") return { pattern: ["██"], fg: "#3b3f46" }
  if (tile === "door") return { pattern: ["++"], fg: "#f4d06f" }
  if (tile === "stairs") return { pattern: [">>"], fg: "#f4d06f" }
  if (tile === "potion") return { pattern: ["!!"], fg: "#d56b8c" }
  if (tile === "relic") return { pattern: ["$$"], fg: "#d6a85c" }
  if (tile === "chest") return { pattern: ["[]"], fg: "#c38b6a" }
  if (tile === "note") return { pattern: ["??"], fg: "#d8c7a1" }
  if (tile === "recipe") return { pattern: ["%%"], fg: "#d9b979" }
  if (tile === "tool") return { pattern: ["&&"], fg: "#9fb4c8" }
  if (tile === "deed") return { pattern: ["~~"], fg: "#86d9ad" }
  if (tile === "fossil") return { pattern: ["ff"], fg: "#b8aa90" }
  if (tile === "boss-memory") return { pattern: ["MM"], fg: "#d56b8c" }
  if (tile === "keepsake") return { pattern: ["kk"], fg: "#f0a8b8" }
  if (tile === "story-relic") return { pattern: ["??"], fg: "#b48ead" }
  if (tile === "trap") return { pattern: ["^^"], fg: "#ff5e86" }
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
  direction?: PlayerMoveAnimation["direction"],
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

  drawPixelBlock(canvas, x, y, animatedPixelSprite(spriteId, animation, frameSeed, width, height, direction), 1)
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

  if (canvas.width < 96 || height < 5) {
    canvas.fill(0, 0, canvas.width, Math.min(4, canvas.height), " ", cleanPanel, cleanPanel)
    if (canvas.height > 4) canvas.fill(0, 4, canvas.width, 1, " ", "#0b1118", "#0b1118")
    const hero = trim(`${session.hero.name} · ${formatBiome(currentBiome(session))} · ${session.floorModifier.name} · ${session.gold}g`, Math.max(16, canvas.width - 34))
    canvas.write(1, 0, hero, UI.ink, cleanPanel)
    drawHudBar(canvas, 1, 1, Math.max(12, Math.floor(canvas.width * 0.32)), "HP", session.hp, session.maxHp, UI.hp, UI.hpBack)
    drawHudBar(canvas, Math.floor(canvas.width * 0.43), 1, Math.max(10, Math.floor(canvas.width * 0.25)), "FOCUS", session.focus, session.maxFocus, UI.focus, UI.focusBack)
    canvas.write(1, 3, trim(session.log[0] ?? "The dungeon waits.", canvas.width - 2), UI.soft, cleanPanel)
    return
  }

  const width = Math.min(canvas.width - 2, 112)
  const x = Math.floor((canvas.width - width) / 2)
  drawPanel(canvas, x, 0, width, height, "Crawler", UI.brass)
  drawPixelBlock(canvas, x + 2, 1, animatedPixelSprite(classSprite(session.hero.classId, session.hero.appearance), "idle", session.turn, 10, 3), 1)

  const infoX = x + 14
  const contentW = width - 17
  canvas.write(infoX, 1, trim(`${session.hero.name}  LV ${session.level}  XP ${session.xp}/${session.level * 10}  ${session.gold}g`, Math.floor(contentW * 0.48)), UI.gold, UI.panel)
  canvas.write(infoX + Math.floor(contentW * 0.5), 1, trim(`${session.hero.title} · ${formatBiome(currentBiome(session))} · ${session.floorModifier.name}`, Math.floor(contentW * 0.48)), UI.soft, UI.panel)
  drawHudBar(canvas, infoX, 2, Math.max(20, Math.floor(contentW * 0.42)), "HP", session.hp, session.maxHp, UI.hp, UI.hpBack)
  drawHudBar(canvas, infoX + Math.floor(contentW * 0.48), 2, Math.max(20, Math.floor(contentW * 0.42)), "FOCUS", session.focus, session.maxFocus, UI.focus, UI.focusBack)

  const quest = focusedQuest(session)
  if (quest && quest.status !== "locked") {
    const progress = questProgress(session, quest.objectiveEventIds)
    const questW = Math.min(contentW, Math.max(28, Math.floor(contentW * 0.64)))
    drawQuestHudLine(canvas, infoX, 3, questW, quest.title, progress.completed, progress.total, quest.status)
  } else {
    canvas.write(infoX, 3, trim(session.log[0] ?? "The dungeon waits.", contentW), UI.soft, UI.panel)
  }
}

function drawQuestHudLine(
  canvas: Canvas,
  x: number,
  y: number,
  width: number,
  title: string,
  completed: number,
  total: number,
  status: string,
) {
  if (width < 18) return
  const bg = "#12201f"
  const edge = status === "completed" ? UI.focus : UI.violet
  canvas.fill(x, y, width, 1, " ", bg, bg)
  canvas.fill(x, y, 1, 1, " ", edge, edge)
  canvas.write(x + 2, y, trim(`Quest ${title}`, width - 10), UI.focus, bg)
  canvas.write(x + width - 6, y, `${completed}/${total}`, UI.soft, bg)
}

function drawToasts(canvas: Canvas, session: GameSession) {
  if (canvas.width < 72 || canvas.height < 24 || !session.toasts.length) return
  const toasts = session.toasts.slice(0, 2)
  const width = Math.min(64, Math.max(44, Math.floor(canvas.width * 0.46)))
  const x = session.combat.active ? 2 : canvas.width - width - 2
  const bottomLimit = canvas.height - gameQuickbarHeight(canvas) - 1
  let y = Math.max(gameHudHeight(canvas) + 1, session.combat.active ? 2 : gameHudHeight(canvas) + 1)

  toasts.forEach((toast, index) => {
    const color = toastToneColor(toast.tone)
    const bg = index === 0 ? "#071014" : "#0b1218"
    const bodyRows = index === 0 ? wrappedRows(toast.text, width - 7, 3) : [compactToastText(toast.text, width - 22)]
    const height = index === 0 ? Math.max(3, bodyRows.length + 2) : 2
    if (y + height > bottomLimit) return

    canvas.fill(x, y, width, height, " ", bg, bg)
    canvas.fill(x, y, 2, height, " ", color, color)
    canvas.write(x + 3, y, trim(toast.title, index === 0 ? width - 6 : 18), color, bg)
    if (index > 0) {
      canvas.write(x + 23, y, trim(bodyRows[0] ?? "", width - 26), UI.soft, bg)
    } else {
      bodyRows.forEach((row, rowIndex) => canvas.write(x + 3, y + 1 + rowIndex, trim(row, width - 7), UI.ink, bg))
    }
    y += height + 1
  })

  if (session.toasts.length > toasts.length && y + 1 <= bottomLimit) {
    const more = session.toasts.length - toasts.length
    canvas.fill(x + width - 14, y, 12, 1, " ", cleanPanel3, cleanPanel3)
    canvas.write(x + width - 12, y, `+${more} more`, UI.muted, cleanPanel3)
  }
}

function compactToastText(text: string, width: number) {
  const first = wrappedRows(text, Math.max(12, width), 1)[0] ?? text
  return first
}

function wrappedRows(text: string, width: number, maxRows: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const rows: string[] = []
  let current = ""
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= width) {
      current = next
      continue
    }
    if (current) rows.push(current)
    current = word
    if (rows.length >= maxRows) break
  }
  if (current && rows.length < maxRows) rows.push(current)
  return rows.slice(0, maxRows)
}

function toastToneColor(tone: GameSession["toasts"][number]["tone"]) {
  if (tone === "success") return UI.focus
  if (tone === "warning") return UI.gold
  if (tone === "danger") return UI.hp
  return UI.cyan
}

function focusedQuest(session: GameSession) {
  return (
    session.world.quests.find((quest) => quest.status === "active") ??
    session.world.quests.find((quest) => quest.status === "completed") ??
    null
  )
}

function visibleQuestList(session: GameSession) {
  const unlocked = session.world.quests.filter((quest) => quest.status !== "locked")
  return unlocked.length ? unlocked : session.world.quests.slice(0, 1)
}

function drawQuickbar(canvas: Canvas, session: GameSession, animation: DiceRollAnimation | null | undefined, settings: UserSettings) {
  const height = gameQuickbarHeight(canvas)
  if (!height) return
  const items: QuickbarItem[] = session.combat.active
    ? [
        { key: "1", label: "Strike", sprite: "sword", active: session.combat.selectedSkill === 0 },
        { key: "2", label: "Aimed", sprite: "bow", active: session.combat.selectedSkill === 1 },
        { key: "3", label: "Burst", sprite: "staff", active: session.combat.selectedSkill === 2 },
        {
          key: "H",
          label: "Potion",
          sprite: "potion",
          count: String(countInventory(session, "Deploy nerve potion")),
          active: session.hp < session.maxHp,
        },
        { key: "F", label: "Flee", sprite: "map", active: true },
        { key: "Ent", label: "Roll", custom: "d20", active: true },
      ]
    : [
        { key: "E", label: "Use", sprite: "quest-marker", active: Boolean(session.conversation || session.skillCheck) },
        {
          key: "H",
          label: "Potion",
          sprite: "potion",
          count: String(countInventory(session, "Deploy nerve potion")),
          active: session.hp < session.maxHp,
        },
        { key: "R", label: "Rest", sprite: "food" },
        { key: "J", label: "Quest", sprite: "quest-marker", count: String(session.world.quests.filter((quest) => quest.status !== "locked").length) },
        { key: "B", label: "Book", sprite: "scroll", count: String(session.knowledge.length) },
        { key: "L", label: "Log", sprite: "scroll" },
        { key: "I", label: "Pack", sprite: "pack", count: String(session.inventory.length) },
      ]
  const slotCount = items.length
  const slotWidth = Math.max(10, Math.min(height >= 10 ? 16 : 13, Math.floor((canvas.width - 4) / slotCount)))
  const width = slotCount * slotWidth + 4
  const x = Math.max(2, Math.floor((canvas.width - width) / 2))
  const y = canvas.height - height

  drawPanel(canvas, x, y, width, height - 1, session.combat.active ? "Action Bar" : "Pack", session.combat.active ? UI.gold : UI.edge)
  items.forEach((item, index) => {
    const slotX = x + 2 + index * slotWidth
    const edge = item.active ? UI.gold : UI.edge
    drawPixelSlot(canvas, slotX, y + 1, slotWidth - 1, height - 2, edge, Boolean(item.active))
    drawKeyBadge(canvas, slotX + 1, y + 1, item.key, Boolean(item.active))
    if (item.custom === "d20") {
      const diceWidth = height >= 10 ? 11 : 8
      const diceHeight = height >= 10 ? 5 : 3
      drawD20Sprite(canvas, slotX + 2, y + 2, diceResult(session, animation), diceFrame(session, animation), diceWidth, diceHeight, settings.diceSkin, item.active && !settings.reduceMotion, animation)
    } else if (item.sprite) {
      drawMiniIcon(canvas, slotX + 3, y + 2, item.sprite, height >= 10 ? 9 : 7, height >= 10 ? 4 : 3)
    }
    canvas.write(slotX + 1, y + height - 3, trim(item.label, slotWidth - 3), item.active ? UI.gold : UI.soft, cleanPanel2)
    if (item.count !== undefined && item.count !== "0") {
      const count = trim(item.count, 3)
      canvas.write(slotX + slotWidth - count.length - 2, y + 1, count, UI.gold, cleanPanel3)
    }
  })
}

function drawPixelSlot(canvas: Canvas, x: number, y: number, width: number, height: number, edge: string, active: boolean) {
  const bg = active ? cleanPanel3 : cleanPanel2
  canvas.fill(x, y, width, height, " ", bg, bg)
  drawCleanBox(canvas, x, y, width, height, active ? edge : cleanLine, bg)
  if (height > 3) {
    canvas.fill(x + 2, y + 2, width - 4, Math.max(1, height - 5), " ", UI.bg, UI.bg)
    canvas.fill(x + 2, y + height - 3, width - 4, 1, " ", active ? "#22303c" : "#111c25", active ? "#22303c" : "#111c25")
  }
  if (active && height > 2) canvas.fill(x, y + 1, 1, height - 2, " ", edge, edge)
}

function drawKeyBadge(canvas: Canvas, x: number, y: number, key: string, active: boolean) {
  canvas.write(x, y, trim(key, Math.max(1, key.length)), active ? UI.gold : UI.soft)
}

function drawCombatPanel(canvas: Canvas, session: GameSession, animation: DiceRollAnimation | null | undefined, settings: UserSettings) {
  const minHeight = Math.max(24, 13 + combatSkills.length * 2)
  const width = Math.min(82, Math.max(58, Math.floor(canvas.width * 0.48)))
  const height = Math.min(30, Math.max(minHeight, canvas.height - gameQuickbarHeight(canvas) - 3))
  const x = Math.max(1, canvas.width - width - 2)
  const y = Math.max(1, canvas.height - gameQuickbarHeight(canvas) - height - 1)
  const targets = combatTargets(session)
  const selectedSkill = combatSkills[session.combat.selectedSkill]
  const roll = session.combat.lastRoll
  const playerStatus = formatStatusEffects(statusEffectsFor(session, "player"))
  const targetW = Math.max(26, Math.floor(width * 0.43))
  const actionX = x + targetW + 3
  const actionW = width - targetW - 5
  const diceW = 16

  drawPanel(canvas, x, y, width, height, "Turn Combat", UI.gold)
  canvas.write(x + 2, y + 2, "A/D target", UI.muted, UI.panel)
  canvas.write(x + 15, y + 2, "W/S skill", UI.muted, UI.panel)
  canvas.write(x + 27, y + 2, "F flee", UI.muted, UI.panel)
  canvas.write(x + 36, y + 2, "Enter roll", UI.muted, UI.panel)
  canvas.write(x + 2, y + 3, trim(`Round ${session.combat.round || 1}  Order ${formatInitiativeOrder(session)}`, width - 4), UI.brass, UI.panel)

  canvas.write(x + 2, y + 4, "Targets", UI.brass, UI.panel)
  const targetLimit = height < 21 ? 2 : 3
  targets.slice(0, targetLimit).forEach((target, index) => {
    const selected = index === session.combat.selectedTarget
    const cardY = y + 5 + index * 3
    const bg = selected ? UI.panel3 : UI.panel2
    canvas.fill(x + 2, cardY, targetW, 3, " ", bg, bg)
    canvas.border(x + 2, cardY, targetW, 3, selected ? UI.gold : UI.edgeDim)
    if (selected) canvas.fill(x + 3, cardY + 1, 1, 1, " ", UI.gold, UI.gold)
    drawMiniIcon(canvas, x + 5, cardY + 1, actorSpriteId(target.kind), 7, 1, selected ? 1 : 0.75)
    canvas.write(x + 13, cardY + 1, trim(`${selected ? ">" : " "} ${actorLabel(target.kind)}  HP ${target.hp}`, targetW - 15), selected ? UI.gold : UI.ink, bg)
    const targetStatus = formatStatusEffects(statusEffectsFor(session, target.id))
    canvas.write(x + 13, cardY + 2, trim(targetStatus || enemyBehaviorText(target), targetW - 15), targetStatus ? UI.focus : target.ai?.alerted ? UI.hp : UI.muted, bg)
  })

  canvas.write(actionX, y + 4, "Actions", UI.brass, UI.panel)
  combatSkills.forEach((skill, index) => {
    const selected = index === session.combat.selectedSkill
    const focusCost = focusCostForSkill(session, skill)
    const unavailable = session.focus < focusCost
    const modifier = combatModifier(session, skill.stat)
    const dc = skill.dc + targetDefenseBonus(targets[session.combat.selectedTarget]?.kind)
    const row = y + 5 + index * 2
    const bg = selected ? UI.panel3 : UI.panel2
    canvas.fill(actionX, row, actionW, 1, " ", bg, bg)
    if (selected) canvas.fill(actionX, row, 1, 1, " ", UI.gold, UI.gold)
    canvas.write(actionX + 2, row, `${index + 1}`, selected ? UI.gold : UI.soft, bg)
    canvas.write(actionX + 5, row, trim(skill.name, Math.max(6, actionW - 27)), unavailable ? UI.muted : selected ? UI.focus : UI.ink, bg)
    canvas.write(actionX + Math.max(18, actionW - 22), row, `${statAbbreviations[skill.stat]} ${formatModifier(modifier)}`, unavailable ? UI.muted : UI.gold, bg)
    canvas.write(actionX + actionW - 10, row, `DC ${dc}`, unavailable ? UI.muted : UI.soft, bg)
    canvas.write(actionX + actionW - 4, row, `F${focusCost}`, unavailable ? UI.hp : focusCost < skill.cost ? UI.focus : UI.muted, bg)
  })

  const fleeY = y + 5 + combatSkills.length * 2
  canvas.fill(actionX, fleeY, actionW, 1, " ", UI.panel2, UI.panel2)
  canvas.write(actionX + 2, fleeY, "F", UI.gold, UI.panel2)
  canvas.write(actionX + 5, fleeY, "Flee", UI.ink, UI.panel2)
  canvas.write(actionX + Math.max(18, actionW - 25), fleeY, `DEX/LCK ${formatModifier(fleeModifier(session))}`, UI.gold, UI.panel2)
  canvas.write(actionX + actionW - 10, fleeY, `DC ${fleeDc(session)}`, UI.soft, UI.panel2)

  const detailY = y + height - 7
  const detailW = width - diceW - 7
  canvas.fill(x + 2, detailY, detailW, 4, " ", UI.panel2, UI.panel2)
  canvas.border(x + 2, detailY, detailW, 4, UI.edgeDim)
  const detail = roll?.skill === "Flee" ? "Escape check uses Dexterity, Luck, Endurance, and level." : selectedSkill.text
  const statusLine = playerStatus ? `You: ${playerStatus}` : session.combat.message
  writeWrapped(canvas, x + 4, detailY + 1, detailW - 4, [detail, statusLine], 2, UI.ink, UI.panel2)

  const diceX = x + width - diceW - 3
  const diceY = detailY
  const diceAccent = roll ? (roll.hit ? UI.focus : UI.hp) : UI.gold
  canvas.fill(diceX, diceY, diceW, 5, " ", UI.panel2, UI.panel2)
  canvas.border(diceX, diceY, diceW, 5, diceAccent)
  drawD20Sprite(canvas, diceX + 1, diceY + 1, diceResult(session, animation), diceFrame(session, animation), 8, 3, settings.diceSkin, !settings.reduceMotion, animation)
  canvas.write(diceX + 10, diceY + 1, roll ? String(roll.d20).padStart(2, "0") : "d20", "#ffffff", UI.panel2)
  canvas.write(diceX + 2, diceY + 3, roll ? `${roll.total}/${roll.dc}` : statAbbreviations[selectedSkill.stat], "#ffffff", UI.panel2)

  const footer = roll ? `${roll.skill} ${roll.hit ? (roll.skill === "Flee" ? "success" : "hit") : roll.skill === "Flee" ? "failed" : "miss"} ${roll.target}` : "Enter rolls selected skill. F attempts escape."
  canvas.write(x + 2, y + height - 2, trim(footer, width - 4), UI.muted, UI.panel)
}

function formatStatusEffects(effects: ReturnType<typeof statusEffectsFor>) {
  return effects.map((effect) => `${effect.label} ${effect.remainingTurns}`).join("  ")
}

function formatBiome(biome: string) {
  return biome
    .split(/\s+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ")
}

function drawConversationPanel(canvas: Canvas, session: GameSession) {
  const conversation = session.conversation
  if (!conversation) return

  const width = Math.min(78, canvas.width - 6)
  const hasChoices = conversation.options.length > 0 && conversation.status === "open"
  const height = hasChoices ? 13 : 10
  const x = Math.floor((canvas.width - width) / 2)
  const y = Math.max(1, canvas.height - gameQuickbarHeight(canvas) - height - 2)
  const trade = conversation.trade
  const title = trade ? "Merchant" : "Conversation"
  const accent = trade && trade.purchased ? UI.focus : trade ? UI.gold : UI.edge

  drawPanel(canvas, x, y, width, height, title, accent)
  const portraitId = portraitIdForSprite(actorSpriteId(conversation.kind))
  if (portraitId) drawPixelBlock(canvas, x + 3, y + 2, portraitSprite(portraitId, 9, 4), 1)
  else drawMiniIcon(canvas, x + 3, y + 2, actorSpriteId(conversation.kind), 8, 2)
  canvas.write(x + 14, y + 2, trim(conversation.speaker, width - 18), UI.gold, UI.panel)
  writeWrapped(canvas, x + 14, y + 4, width - 18, [conversation.text], 2, UI.ink, UI.panel)
  if (trade) {
    const tradeText = trade.purchased ? `${trade.item} in pack` : `${trade.item}  ${trade.price}g`
    canvas.write(x + 14, y + height - 4, trim(tradeText, width - 26), trade.purchased ? UI.focus : UI.brass, UI.panel)
  }
  if (hasChoices) {
    const optionY = y + 8
    conversation.options.slice(0, 3).forEach((option, index) => {
      const selected = index === conversation.selectedOption
      const optionX = x + 14 + index * Math.max(14, Math.floor((width - 18) / 3))
      canvas.write(optionX, optionY, `${index + 1}`, selected ? UI.gold : UI.muted, UI.panel)
      canvas.write(optionX + 2, optionY, trim(option.label, 12), selected ? UI.focus : UI.soft, UI.panel)
    })
    canvas.write(x + 14, y + height - 2, trim("1-3 choose  Enter confirm  Esc leave", width - 18), UI.muted, UI.panel)
  } else {
    canvas.write(x + 14, y + height - 2, trim("Enter close  Esc leave", width - 18), UI.muted, UI.panel)
  }
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
  drawPixelBlock(canvas, infoX + infoW - 10, diceY + 4, pixelSprite(classSprite(session.hero.classId, session.hero.appearance), 8, 3), 0.85)
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

function drawLevelUpModal(canvas: Canvas, session: GameSession) {
  const levelUp = session.levelUp
  if (!levelUp) return
  const width = Math.min(86, canvas.width - 8)
  const height = Math.min(18, canvas.height - 6)
  const x = Math.floor((canvas.width - width) / 2)
  const y = Math.floor((canvas.height - height) / 2)

  drawPanel(canvas, x, y, width, height, `Level ${levelUp.level}`, UI.gold)
  drawPixelBlock(canvas, x + 4, y + 4, animatedPixelSprite(classSprite(session.hero.classId, session.hero.appearance), "idle", session.turn, 12, 5), 1)
  canvas.write(x + 19, y + 3, trim(`${session.hero.name} can learn a talent.`, width - 24), UI.ink, UI.panel)
  canvas.write(x + 19, y + 4, trim(statLine(session.stats), width - 24), UI.soft, UI.panel)

  levelUp.choices.forEach((choice, index) => {
    const rowY = y + 7 + index * 3
    const rowW = width - 24
    const rowX = x + 19
    canvas.fill(rowX, rowY, rowW, 2, " ", cleanPanel2, cleanPanel2)
    canvas.write(rowX + 2, rowY, `${index + 1}`, UI.gold, cleanPanel2)
    canvas.write(rowX + 5, rowY, trim(choice.name, rowW - 7), UI.focus, cleanPanel2)
    canvas.write(rowX + 5, rowY + 1, trim(choice.text, rowW - 7), UI.soft, cleanPanel2)
  })

  canvas.center(y + height - 2, "Press 1-3 to choose. Enter chooses the first talent.", UI.muted, UI.panel)
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

function writeWrapped(canvas: Canvas, x: number, y: number, width: number, paragraphs: readonly string[], maxRows: number, fg: string, bg?: string) {
  const words = paragraphs.join(" ").split(/\s+/).filter(Boolean)
  const rows: string[] = []
  let current = ""
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= width) {
      current = next
      continue
    }
    if (current) rows.push(current)
    current = word
    if (rows.length >= maxRows) break
  }
  if (current && rows.length < maxRows) rows.push(current)
  rows.slice(0, maxRows).forEach((row, index) => canvas.write(x, y + index, trim(row, width), fg, bg))
}

function gameHudHeight(canvas: Canvas) {
  return canvas.height < 28 ? 4 : 5
}

function gameQuickbarHeight(canvas: Canvas) {
  if (canvas.height < 30 || canvas.width < 90) return 0
  return canvas.height >= 42 && canvas.width >= 120 ? 10 : 8
}

function drawUiToggleHint(canvas: Canvas, hidden: boolean) {
  const text = hidden ? "U show UI" : "U hide UI"
  const width = text.length + 4
  const x = Math.max(0, canvas.width - width - 2)
  const y = Math.max(0, canvas.height - 2)
  canvas.fill(x, y, width, 1, " ", UI.panel2, UI.panel2)
  canvas.write(x + 2, y, text, hidden ? UI.focus : UI.soft, UI.panel2)
}

function drawPanel(canvas: Canvas, x: number, y: number, width: number, height: number, title: string, accent = UI.edge) {
  canvas.fill(x, y, width, height, " ", cleanPanel, cleanPanel)
  drawCleanBox(canvas, x, y, width, height, accent === UI.gold || accent === UI.brass ? cleanLineHot : cleanLine, cleanPanel)
  if (height > 3) canvas.write(x + 2, y + 1, trim(title, width - 4), accent)
}

function drawCleanBox(canvas: Canvas, x: number, y: number, width: number, height: number, edge = cleanLine, bg = cleanPanel) {
  if (width < 2 || height < 2) return
  canvas.fill(x, y, width, height, " ", bg, bg)
  canvas.border(x, y, width, height, edge)
  if (width > 4 && height > 4) {
    canvas.fill(x + 1, y + 1, width - 2, 1, " ", cleanPanel2, cleanPanel2)
    canvas.fill(x + 1, y + height - 2, width - 2, 1, " ", "#0d151d", "#0d151d")
  }
}

function drawCommandBox(canvas: Canvas, x: number, y: number, width: number, labelText: string, hint: string) {
  const bg = UI.panel2
  canvas.fill(x, y, width, 3, " ", bg, bg)
  canvas.fill(x, y + 1, 1, 1, " ", UI.focus, UI.focus)
  canvas.write(x + 4, y + 1, trim(labelText, Math.max(6, Math.floor(width * 0.5))), UI.ink, bg)
  const hintW = Math.max(6, Math.floor(width * 0.36))
  canvas.write(x + width - hintW - 3, y + 1, trim(hint, hintW), UI.muted, bg)
}

function drawPlainSelectRow(canvas: Canvas, x: number, y: number, width: number, labelText: string, selected: boolean, meta = "", disabled = false) {
  const bg = selected ? UI.panel3 : UI.panel
  const edge = selected ? (disabled ? UI.edgeDim : UI.edgeHot) : UI.edgeDim
  const labelColor = disabled ? UI.muted : selected ? UI.gold : UI.ink
  const markerColor = disabled ? UI.muted : selected ? UI.gold : UI.soft
  canvas.fill(x, y, width, 1, " ", bg, bg)
  canvas.write(x + 2, y, disabled ? "x" : selected ? ">" : " ", markerColor, bg)
  canvas.write(x + 4, y, trim(labelText, Math.max(4, width - 22)), labelColor, bg)
  if (meta && width > 38) {
    const metaW = Math.max(6, Math.floor(width * 0.24))
    canvas.write(x + width - metaW - 2, y, trim(meta, metaW), disabled ? UI.muted : selected ? UI.focus : UI.muted, bg)
  }
  if (selected && width > 6) canvas.write(x + 1, y, "█", edge, bg)
}

function drawTabSelect(canvas: Canvas, x: number, y: number, width: number, tabs: ReadonlyArray<{ name: string; description: string }>, selectedIndex: number) {
  const tabWidth = Math.max(6, Math.floor(width / tabs.length))
  canvas.fill(x, y, width, 3, " ", UI.panel, UI.panel)
  tabs.forEach((tab, index) => {
    const tabX = x + index * tabWidth
    const tabW = index === tabs.length - 1 ? width - index * tabWidth : tabWidth
    const selected = index === selectedIndex
    const bg = selected ? UI.panel3 : UI.panel
    canvas.fill(tabX, y, tabW, 1, " ", bg, bg)
    canvas.write(tabX + 1, y, trim(tab.name, tabW - 2), selected ? UI.gold : UI.ink, bg)
    if (selected) canvas.fill(tabX, y + 1, tabW, 1, "─", UI.gold, bg)
  })
  const selected = tabs[selectedIndex]
  if (selected) canvas.write(x + 1, y + 2, trim(selected.description, width - 2), UI.soft, UI.panel)
}

function drawScrollbar(canvas: Canvas, x: number, y: number, height: number, offset: number, visible: number, total: number) {
  if (total <= visible || height < 3) return
  canvas.fill(x, y, 1, height, "│", UI.edgeDim, UI.panel)
  const thumbHeight = Math.max(1, Math.round((visible / total) * height))
  const maxOffset = Math.max(1, total - visible)
  const thumbY = y + Math.round((offset / maxOffset) * Math.max(0, height - thumbHeight))
  canvas.fill(x, thumbY, 1, thumbHeight, "█", UI.gold, UI.panel)
}

function drawSettingsOption(canvas: Canvas, x: number, y: number, width: number, option: SettingOption, model: AppModel, selected: boolean) {
  const bg = selected ? UI.panel3 : UI.panel2
  drawSelectCard(canvas, x, y, width, 2, selected)
  canvas.write(x + 2, y, `${selected ? ">" : " "} ${option.name}`, selected ? UI.gold : UI.ink, bg)
  const controlX = x + Math.max(18, Math.floor(width * 0.42))
  const controlW = width - (controlX - x) - 3
  drawSettingControl(canvas, controlX, y, controlW, option, model, selected, bg)
  canvas.write(x + 4, y + 1, trim(option.text, width - 6), selected ? UI.ink : UI.muted, bg)
}

function drawSettingControl(canvas: Canvas, x: number, y: number, width: number, option: SettingOption, model: AppModel, selected: boolean, bg: string) {
  if (option.control === "readonly") {
    canvas.write(x, y, trim(settingValue(model, option.id), width), selected ? UI.gold : UI.soft, bg)
    return
  }

  if (option.control === "switch") {
    drawSwitch(canvas, x, y, width, settingValue(model, option.id) === "on", selected, bg)
    return
  }

  if (option.control === "slider") {
    const values = settingSliderValues(option.id)
    const value = settingValue(model, option.id)
    drawSlider(canvas, x, y, width, values.indexOf(value), values.length, value, selected, bg)
    return
  }

  if (option.control === "tabs") {
    const value = settingValue(model, option.id)
    drawSegmentedValue(canvas, x, y, width, settingSegments(option.id, value), value, selected, bg)
    return
  }

  canvas.write(x, y, trim(settingValue(model, option.id), width), selected ? UI.focus : UI.soft, bg)
}

function drawSwitch(canvas: Canvas, x: number, y: number, width: number, enabled: boolean, selected: boolean, bg: string) {
  const labelText = enabled ? "ON" : "OFF"
  const left = enabled ? "●" : "○"
  const text = `[${left} ${labelText}]`
  canvas.write(x + Math.max(0, width - text.length), y, text, enabled ? UI.focus : selected ? UI.gold : UI.soft, bg)
}

function drawSlider(canvas: Canvas, x: number, y: number, width: number, index: number, count: number, labelText: string, selected: boolean, bg: string) {
  const label = trim(labelText, 10)
  const trackW = Math.max(8, width - label.length - 3)
  const clamped = clamp(index, 0, Math.max(0, count - 1))
  const thumb = count <= 1 ? 0 : Math.round((clamped / (count - 1)) * (trackW - 1))
  canvas.write(x, y, "─".repeat(trackW), selected ? UI.gold : UI.edge, bg)
  canvas.write(x + thumb, y, "◆", selected ? UI.focus : UI.gold, bg)
  canvas.write(x + trackW + 2, y, label, selected ? UI.focus : UI.soft, bg)
}

function drawSegmentedValue(canvas: Canvas, x: number, y: number, width: number, options: readonly string[], value: string, selected: boolean, bg: string) {
  let cursor = x
  for (const option of options) {
    const active = option === value
    const text = trim(option, Math.max(3, Math.min(10, width - (cursor - x) - 2)))
    const segment = active ? `[${text}]` : ` ${text} `
    if (cursor + segment.length > x + width) break
    canvas.write(cursor, y, segment, active ? UI.focus : selected ? UI.ink : UI.soft, active ? UI.panel : bg)
    cursor += segment.length + 1
  }
}

function drawInputField(canvas: Canvas, x: number, y: number, width: number, labelText: string, value: string, focused: boolean) {
  canvas.write(x, y, trim(labelText, 12), UI.brass, UI.panel)
  const inputX = x + 13
  const inputW = Math.max(10, width - 13)
  canvas.fill(inputX, y - 1, inputW, 3, " ", focused ? UI.panel3 : UI.panel2, focused ? UI.panel3 : UI.panel2)
  canvas.border(inputX, y - 1, inputW, 3, focused ? UI.focus : UI.edgeDim)
  canvas.write(inputX + 2, y, trim(value, inputW - 4), focused ? UI.focus : UI.ink, focused ? UI.panel3 : UI.panel2)
}

function drawSelectCard(canvas: Canvas, x: number, y: number, width: number, height: number, selected: boolean) {
  const bg = selected ? UI.panel3 : UI.panel2
  canvas.fill(x, y, width, height, " ", bg, bg)
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
  const rows = pixelText("OPENDUNGEON")
  const rowWidth = rows[0]?.length ?? 0
  if (rowWidth > width) return drawCompactBrand(canvas, y, width)
  const logoX = x + Math.max(0, Math.floor((width - rowWidth) / 2))
  rows.forEach((row, index) => {
    canvas.write(logoX + 1, y + index + 1, row, UI.shadow, bg)
    canvas.write(logoX, y + index, row, index % 2 ? UI.gold : UI.brass, bg)
  })
  const tagline = "terminal dungeon crawler"
  if (width > tagline.length + 2) canvas.write(x + Math.floor((width - tagline.length) / 2), y + rows.length + 1, tagline, UI.soft, bg)
  return rows.length + 2
}

function drawCompactBrand(canvas: Canvas, y: number, width: number) {
  canvas.center(y, trim("OPENDUNGEON", width), UI.gold, UI.bg)
  return 1
}

const pixelGlyphs: Record<string, string[]> = {
  " ": ["   ", "   ", "   ", "   ", "   "],
  D: ["███ ", "█  █", "█  █", "█  █", "███ "],
  E: ["████", "█   ", "███ ", "█   ", "████"],
  G: ["████", "█   ", "█ ██", "█  █", "████"],
  N: ["█  █", "██ █", "█ ██", "█  █", "█  █"],
  O: ["████", "█  █", "█  █", "█  █", "████"],
  P: ["███ ", "█  █", "███ ", "█   ", "█   "],
  U: ["█  █", "█  █", "█  █", "█  █", "████"],
}

function pixelText(text: string) {
  const rows = ["", "", "", "", ""]
  for (const char of text.toUpperCase()) {
    const glyph = pixelGlyphs[char] ?? pixelGlyphs[" "]
    for (let row = 0; row < rows.length; row++) rows[row] += `${glyph[row]} `
  }
  return rows.map((row) => row.trimEnd())
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
  if (width < 8) return
  const stat = `${value}/${max}`
  const barWidth = Math.max(4, width - labelText.length - stat.length - 4)
  const ratio = max <= 0 ? 0 : clamp(value / max, 0, 1)
  const filled = Math.max(0, Math.min(barWidth, Math.round(ratio * barWidth)))
  const low = ratio <= 0.25
  const mid = ratio > 0.25 && ratio <= 0.5
  const labelColor = low ? UI.hp : mid ? UI.gold : color
  canvas.write(x, y, labelText, labelColor)
  const barX = x + labelText.length + 1
  canvas.fill(barX, y, barWidth, 1, " ", back, back)
  if (filled > 0) canvas.fill(barX, y, filled, 1, " ", color, color)
  if (filled > 3) canvas.fill(barX + 1, y, Math.max(1, filled - 2), 1, " ", tint(color, 1.16), tint(color, 1.16))
  canvas.write(barX + barWidth + 2, y, trim(stat, Math.max(0, width - (barX + barWidth + 2 - x))), labelColor)
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
  const label = String(result)
  const labelX = x + shake.x + Math.max(0, Math.floor((width - label.length) / 2))
  const labelY = y + shake.y + Math.max(0, Math.floor(height / 2))
  canvas.write(labelX, labelY, label, "#ffffff")
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
  icon: PixelSpriteId | "d20" | null,
  skin: DiceSkinId = defaultDiceSkin,
) {
  canvas.fill(x, y, width, height, " ", cleanPanel, cleanPanel)
  drawCleanBox(canvas, x, y, width, height, title === "Paused" ? cleanLineHot : cleanLine, cleanPanel)
  canvas.write(x + 4, y + 1, title.toUpperCase(), UI.gold, cleanPanel2)
  if (icon === "d20") drawD20Sprite(canvas, x + width - 12, y + 1, 20, d20FrameCount() - 1, 9, 3, skin)
  else if (icon) drawMiniIcon(canvas, x + width - 12, y + 1, icon, 7, 2)
}

type Rect = { x: number; y: number; width: number; height: number }

type InventoryLayout = {
  frame: Rect
  character: Rect
  pack: Rect
  details: Rect
  apply: Rect
  close: Rect
  slots: Rect[]
  columns: number
  rows: number
}

export type InventoryHit = { kind: "slot"; index: number } | { kind: "apply" } | { kind: "close" }

export function inventoryGridInfo(model: AppModel, width: number, height: number) {
  const layout = inventoryLayout(model, width, height)
  return { columns: layout.columns, rows: layout.rows, slotCount: layout.slots.length }
}

export function inventoryHitTest(model: AppModel, width: number, height: number, pointerX: number, pointerY: number): InventoryHit | null {
  if (model.dialog !== "inventory") return null
  const layout = inventoryLayout(model, width, height)
  if (insideRect(layout.apply, pointerX, pointerY)) return { kind: "apply" }
  if (insideRect(layout.close, pointerX, pointerY)) return { kind: "close" }
  const index = layout.slots.findIndex((slot) => insideRect(slot, pointerX, pointerY))
  return index >= 0 ? { kind: "slot", index } : null
}

function dialogMetrics(dialog: NonNullable<DialogId>, canvasWidth: number, canvasHeight: number): Rect {
  if (dialog === "inventory") {
    const width = Math.min(Math.max(20, canvasWidth - 4), Math.min(124, Math.max(62, canvasWidth - 8)))
    const height = Math.min(Math.max(12, canvasHeight - 2), Math.min(36, Math.max(22, canvasHeight - 4)))
    return {
      x: Math.floor((canvasWidth - width) / 2),
      y: Math.floor((canvasHeight - height) / 2),
      width,
      height,
    }
  }

  if (dialog === "map") {
    const width = Math.min(118, Math.max(72, canvasWidth - 8))
    const height = Math.min(36, Math.max(24, canvasHeight - 4))
    return {
      x: Math.floor((canvasWidth - width) / 2),
      y: Math.floor((canvasHeight - height) / 2),
      width,
      height,
    }
  }

  const wide = dialog === "log" || dialog === "settings" || dialog === "quests" || dialog === "book" || dialog === "hub" || dialog === "saveManager" || dialog === "cutscene"
  const width = Math.min(wide ? 88 : 74, Math.max(20, canvasWidth - 10))
  const height = Math.min(Math.max(10, canvasHeight - 2), dialog === "log" ? 18 : dialog === "quests" || dialog === "book" || dialog === "hub" || dialog === "saveManager" ? 22 : dialog === "cutscene" ? 18 : dialog === "settings" ? 20 : dialog === "help" ? 21 : dialog === "pause" ? 18 : dialog === "quit" ? 18 : 14)
  return {
    x: Math.floor((canvasWidth - width) / 2),
    y: Math.floor((canvasHeight - height) / 2),
    width,
    height,
  }
}

function inventoryLayout(model: AppModel, width: number, height: number): InventoryLayout {
  const frame = dialogMetrics("inventory", width, height)
  const innerX = frame.x + 3
  const innerY = frame.y + 4
  const innerW = frame.width - 6
  const innerH = frame.height - 8
  const characterW = Math.min(36, Math.max(24, Math.floor(innerW * 0.32)))
  const character: Rect = { x: innerX, y: innerY, width: characterW, height: innerH - 4 }
  const pack: Rect = {
    x: innerX + characterW + 2,
    y: innerY,
    width: Math.max(28, innerW - characterW - 2),
    height: innerH - 4,
  }
  const details: Rect = { x: innerX, y: frame.y + frame.height - 7, width: innerW, height: 3 }
  const apply: Rect = { x: frame.x + frame.width - 34, y: frame.y + frame.height - 3, width: 14, height: 1 }
  const close: Rect = { x: frame.x + frame.width - 18, y: frame.y + frame.height - 3, width: 12, height: 1 }
  const columns = clamp(Math.floor((pack.width - 4) / 12), 3, 6)
  const slotW = Math.max(9, Math.floor((pack.width - 4 - (columns - 1)) / columns))
  const slotH = 5
  const rows = Math.max(2, Math.floor((pack.height - 5) / slotH))
  const slots: Rect[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      slots.push({
        x: pack.x + 2 + col * (slotW + 1),
        y: pack.y + 3 + row * slotH,
        width: slotW,
        height: 4,
      })
    }
  }

  return { frame, character, pack, details, apply, close, slots, columns, rows }
}

function insideRect(rect: Rect, x: number, y: number) {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
}

function dialogTitle(dialog: NonNullable<DialogId>) {
  if (dialog === "settings") return "Settings"
  if (dialog === "inventory") return "Inventory"
  if (dialog === "book") return "Book"
  if (dialog === "quests") return "Quests"
  if (dialog === "hub") return "Portal Village"
  if (dialog === "saveManager") return "Run Saves"
  if (dialog === "cutscene") return "Story Scene"
  if (dialog === "help") return "Controls"
  if (dialog === "log") return "Run Log"
  if (dialog === "map") return "Dungeon Map"
  if (dialog === "quit") return "Unsaved Run"
  return "Paused"
}

function dialogIcon(dialog: NonNullable<DialogId>): PixelSpriteId | "d20" {
  if (dialog === "settings") return "focus-gem"
  if (dialog === "inventory") return "scroll"
  if (dialog === "book") return "scroll"
  if (dialog === "quests") return "map"
  if (dialog === "hub") return "stairs"
  if (dialog === "saveManager") return "scroll"
  if (dialog === "cutscene") return "focus-gem"
  if (dialog === "help") return "sword"
  if (dialog === "log") return "coin"
  if (dialog === "map") return "map"
  if (dialog === "quit") return "scroll"
  return "scroll"
}

function drawSettingRow(canvas: Canvas, x: number, y: number, width: number, labelText: string, value: string) {
  canvas.fill(x, y, width, 1, " ", UI.panel2, UI.panel2)
  canvas.write(x + 2, y, trim(labelText, 12), UI.brass, UI.panel2)
  canvas.write(x + 16, y, trim(value, width - 18), UI.ink, UI.panel2)
}

function drawKeycap(canvas: Canvas, x: number, y: number, text: string) {
  const key = trim(text, 9)
  const width = Math.max(5, key.length + 4)
  canvas.fill(x, y, width, 1, " ", cleanPanel3, cleanPanel3)
  canvas.write(x, y, `[ ${key} ]`, UI.gold, cleanPanel3)
}

function inventorySprite(name: string): PixelSpriteId {
  const lower = name.toLowerCase()
  if (lower.includes("potion") || lower.includes("vial")) return "potion"
  if (lower.includes("lockpick")) return "lockpick"
  if (lower.includes("food") || lower.includes("ration")) return "food"
  if (lower.includes("gem")) return "gem"
  if (lower.includes("torch") || lower.includes("spark")) return "torch"
  if (lower.includes("shield") || lower.includes("buckler")) return "shield"
  if (lower.includes("axe")) return "axe"
  if (lower.includes("bow") || lower.includes("arrow")) return "bow"
  if (lower.includes("mace") || lower.includes("spanner")) return "staff"
  if (lower.includes("blade") || lower.includes("sword")) return "sword"
  if (lower.includes("scroll") || lower.includes("rollback")) return "scroll"
  if (lower.includes("env") || lower.includes("idol") || lower.includes("relic")) return "relic"
  return "chest"
}

function countInventory(session: GameSession, name: string) {
  return session.inventory.filter((item) => item === name).length
}

function selectedInventoryItem(model: AppModel) {
  return model.session.inventory[clamp(model.inventoryIndex, 0, Math.max(0, model.session.inventory.length - 1))]
}

function drawInventoryDialog(canvas: Canvas, model: AppModel) {
  const layout = inventoryLayout(model, canvas.width, canvas.height)
  const selectedIndex = clamp(model.inventoryIndex, 0, Math.max(0, model.session.inventory.length - 1))
  const selectedItem = selectedInventoryItem(model)

  drawPanel(canvas, layout.character.x, layout.character.y, layout.character.width, layout.character.height, "Crawler", UI.edge)
  drawPixelBlock(
    canvas,
    layout.character.x + 3,
    layout.character.y + 3,
    animatedPixelSprite(classSprite(model.session.hero.classId, model.session.hero.appearance), "idle", model.session.turn, 12, 5),
    1,
  )
  canvas.write(layout.character.x + 17, layout.character.y + 3, trim(model.session.hero.name, layout.character.width - 20), UI.ink, UI.panel)
  canvas.write(layout.character.x + 17, layout.character.y + 4, trim(model.session.hero.title, layout.character.width - 20), UI.soft, UI.panel)
  if (layout.character.height > 11) canvas.write(layout.character.x + 3, layout.character.y + 10, trim(`Level ${model.session.level}   Gold ${model.session.gold}`, layout.character.width - 6), UI.gold, UI.panel)
  if (layout.character.height > 13) canvas.write(layout.character.x + 3, layout.character.y + 12, trim(`HP ${model.session.hp}/${model.session.maxHp}   Focus ${model.session.focus}/${model.session.maxFocus}`, layout.character.width - 6), UI.focus, UI.panel)
  if (layout.character.height > 15) canvas.write(layout.character.x + 3, layout.character.y + 14, trim(statLine(model.session.stats), layout.character.width - 6), UI.soft, UI.panel)
  if (layout.character.height > 18) drawEquipmentLine(canvas, layout.character.x + 3, layout.character.y + 17, layout.character.width - 6, "Weapon", findInventoryByKind(model.session.inventory, "weapon"))
  if (layout.character.height > 19) drawMiniIcon(canvas, layout.character.x + layout.character.width - 9, layout.character.y + 17, weaponSpriteForAppearance(model.session.hero.classId, model.session.hero.appearance), 5, 1)
  if (layout.character.height > 20) drawEquipmentLine(canvas, layout.character.x + 3, layout.character.y + 19, layout.character.width - 6, "Relic", findInventoryByKind(model.session.inventory, "relic"))
  if (layout.character.height > 22) drawEquipmentLine(canvas, layout.character.x + 3, layout.character.y + 21, layout.character.width - 6, "Consumable", findInventoryByKind(model.session.inventory, "consumable"))

  drawPanel(canvas, layout.pack.x, layout.pack.y, layout.pack.width, layout.pack.height, "Pack", UI.edge)
  canvas.write(layout.pack.x + 2, layout.pack.y + 1, trim(`${model.session.inventory.length}/${layout.slots.length} slots   Gold ${model.session.gold}`, layout.pack.width - 4), UI.soft, UI.panel)
  layout.slots.forEach((slot, index) => drawInventorySlot(canvas, slot, model.session.inventory[index], index === selectedIndex, index === model.inventoryDragIndex))

  drawPanel(canvas, layout.details.x, layout.details.y, layout.details.width, layout.details.height, "Selection", UI.edgeDim)
  if (selectedItem) {
    drawMiniIcon(canvas, layout.details.x + 2, layout.details.y + 1, inventorySprite(selectedItem), 6, 1)
    canvas.write(layout.details.x + 10, layout.details.y + 1, trim(selectedItem, Math.floor(layout.details.width * 0.34)), UI.gold, UI.panel)
    canvas.write(layout.details.x + Math.floor(layout.details.width * 0.42), layout.details.y + 1, trim(inventoryItemDescription(selectedItem), Math.floor(layout.details.width * 0.44)), UI.soft, UI.panel)
  } else {
    canvas.write(layout.details.x + 2, layout.details.y + 1, "Pack is empty.", UI.soft, UI.panel)
  }

  if (model.message) canvas.write(layout.details.x + 2, layout.details.y + 2, trim(model.message, layout.details.width - 4), UI.muted, UI.panel)
  drawInventoryButton(canvas, layout.apply, "Enter use", selectedItem ? UI.focus : UI.muted)
  drawInventoryButton(canvas, layout.close, "Esc close", UI.gold)
}

function drawEquipmentLine(canvas: Canvas, x: number, y: number, width: number, labelText: string, item: string | undefined) {
  canvas.write(x, y, trim(labelText, 10), UI.brass, UI.panel)
  canvas.write(x + 12, y, trim(item ?? "empty", width - 12), item ? UI.ink : UI.muted, UI.panel)
}

function drawInventorySlot(canvas: Canvas, rect: Rect, item: string | undefined, selected: boolean, dragging: boolean) {
  const bg = selected ? cleanPanel3 : cleanPanel2
  canvas.fill(rect.x, rect.y, rect.width, rect.height, " ", bg, bg)
  drawCleanBox(canvas, rect.x, rect.y, rect.width, rect.height, selected ? UI.gold : cleanLine, bg)
  if (selected || dragging) canvas.fill(rect.x, rect.y, 1, rect.height, " ", dragging ? UI.cyan : UI.gold, dragging ? UI.cyan : UI.gold)
  if (!item) return
  drawMiniIcon(canvas, rect.x + 2, rect.y + 1, inventorySprite(item), Math.min(5, Math.max(4, rect.width - 4)), 1, dragging ? 0.65 : 1)
  const labelWidth = Math.max(0, rect.width - 2)
  if (labelWidth >= 5) {
    const labelY = rect.y + rect.height - 2
    const labelBg = selected ? "#22303c" : "#111c25"
    canvas.fill(rect.x + 1, labelY, rect.width - 2, 1, " ", labelBg, labelBg)
    canvas.write(rect.x + 1, labelY, trimInventoryLabel(item, labelWidth), selected ? UI.gold : UI.ink, labelBg)
  }
}

function drawInventoryButton(canvas: Canvas, rect: Rect, text: string, color: string) {
  canvas.fill(rect.x, rect.y, rect.width, rect.height, " ", cleanPanel3, cleanPanel3)
  canvas.write(rect.x + 1, rect.y, trim(text, rect.width - 2), color, cleanPanel3)
}

function findInventoryByKind(inventory: string[], kind: "weapon" | "relic" | "consumable") {
  if (kind === "weapon") return inventory.find((item) => /blade|sword|lockpick/i.test(item))
  if (kind === "relic") return inventory.find((item) => /relic|shard|scroll/i.test(item))
  return inventory.find((item) => /potion|vial/i.test(item))
}

function inventoryItemDescription(item: string) {
  const lower = item.toLowerCase()
  if (lower.includes("potion")) return "Restores health when applied."
  if (lower.includes("vial")) return "Small healing vial. Click or Enter to apply."
  if (lower.includes("scroll")) return "Run-scoped utility item."
  if (lower.includes("relic") || lower.includes("shard")) return "Quest and lore item."
  if (lower.includes("blade") || lower.includes("sword")) return "Equipped as a basic weapon."
  return "Stored in this world save."
}

function questProgress(session: GameSession, eventIds: string[]) {
  if (!eventIds.length) return { completed: 0, total: 0 }
  const completed = eventIds.filter((eventId) => session.world.events.find((event) => event.id === eventId)?.status === "completed").length
  return { completed, total: eventIds.length }
}

function drawBookDialog(canvas: Canvas, model: AppModel, x: number, y: number, width: number, height: number) {
  const entries = model.session.knowledge
  const listX = x + 4
  const listY = y + 4
  const listW = Math.min(34, Math.floor((width - 10) * 0.4))
  const rowH = 2
  const visibleRows = Math.max(4, Math.min(entries.length || 1, Math.floor((height - 8) / rowH)))
  const offset = scrollOffset(model.bookIndex, visibleRows, entries.length)
  const selectedEntry = entries[clamp(model.bookIndex, 0, Math.max(0, entries.length - 1))]

  canvas.write(listX, y + 3, "Known", UI.brass, UI.panel)
  drawScrollbar(canvas, listX + listW + 1, listY, visibleRows * rowH, offset, visibleRows, entries.length)
  entries.slice(offset, offset + visibleRows).forEach((entry, visibleIndex) => {
    const index = offset + visibleIndex
    drawBookListRow(canvas, listX, listY + visibleIndex * rowH, listW, entry, index === model.bookIndex)
  })
  if (!entries.length) canvas.write(listX, listY, "No notes recovered yet.", UI.soft, UI.panel)

  const detailX = listX + listW + 4
  const detailW = width - (detailX - x) - 4
  const detailH = height - 8
  drawPanel(canvas, detailX, listY - 1, detailW, detailH, "Entry", UI.edge)
  if (!selectedEntry) return

  drawMiniIcon(canvas, detailX + detailW - 11, listY + 1, bookEntryIcon(selectedEntry.kind), 8, 2)
  canvas.write(detailX + 3, listY + 1, trim(selectedEntry.title, detailW - 16), UI.gold, UI.panel)
  canvas.write(detailX + 3, listY + 3, trim(`${bookKindLabel(selectedEntry.kind)}${selectedEntry.floor ? `  Floor ${selectedEntry.floor}` : ""}  Turn ${selectedEntry.discoveredAtTurn}`, detailW - 6), UI.soft, UI.panel)
  writeWrapped(canvas, detailX + 3, listY + 6, detailW - 6, [selectedEntry.text], Math.max(3, detailH - 9), UI.ink, UI.panel)
}

function drawBookListRow(canvas: Canvas, x: number, y: number, width: number, entry: GameSession["knowledge"][number], selected: boolean) {
  const bg = selected ? cleanPanel3 : cleanPanel2
  const color = entry.kind === "hub" ? UI.focus : entry.kind === "memory" ? UI.gold : selected ? UI.ink : UI.soft
  canvas.fill(x, y, width, 2, " ", bg, bg)
  if (selected) drawCleanBox(canvas, x, y, width, 2, UI.gold, bg)
  if (selected) canvas.fill(x, y, 1, 2, " ", UI.gold, UI.gold)
  canvas.write(x + 2, y, trim(entry.title, width - 4), selected ? UI.gold : UI.ink, bg)
  canvas.write(x + 2, y + 1, trim(bookKindLabel(entry.kind), width - 10), color, bg)
  if (entry.floor) canvas.write(x + width - 5, y + 1, `F${entry.floor}`, UI.muted, bg)
}

function bookKindLabel(kind: GameSession["knowledge"][number]["kind"]) {
  if (kind === "memory") return "Memory"
  if (kind === "npc") return "NPC"
  if (kind === "tutorial") return "Tutorial"
  if (kind === "hub") return "Hub"
  return "Note"
}

function bookEntryIcon(kind: GameSession["knowledge"][number]["kind"]): PixelSpriteId {
  if (kind === "hub") return "stairs"
  if (kind === "npc") return "npc-oracle"
  if (kind === "memory") return "focus-gem"
  return "scroll"
}

function drawQuestsDialog(canvas: Canvas, model: AppModel, x: number, y: number, width: number, height: number) {
  const allQuests = model.session.world.quests
  const quests = visibleQuestList(model.session)
  const selectedIndex = clamp(model.questIndex, 0, Math.max(0, quests.length - 1))
  const lockedCount = allQuests.filter((quest) => quest.status === "locked").length
  const listX = x + 4
  const listY = y + 4
  const listW = Math.min(36, Math.floor((width - 10) * 0.42))
  const rowH = 2
  const visibleRows = Math.max(4, Math.min(quests.length || 1, Math.floor((height - 8) / rowH)))
  const offset = scrollOffset(selectedIndex, visibleRows, quests.length)
  const selectedQuest = quests[selectedIndex]

  canvas.write(listX, y + 3, "Journal", UI.brass, UI.panel)
  drawScrollbar(canvas, listX + listW + 1, listY, visibleRows * rowH, offset, visibleRows, quests.length)
  quests.slice(offset, offset + visibleRows).forEach((quest, visibleIndex) => {
    const index = offset + visibleIndex
    drawQuestListRow(canvas, listX, listY + visibleIndex * rowH, listW, model, quest, index === selectedIndex)
  })
  if (!quests.length) canvas.write(listX, listY, "No quests generated yet.", UI.soft, UI.panel)
  if (lockedCount > 0) canvas.write(listX, y + height - 5, trim(`${lockedCount} locked quest chain${lockedCount === 1 ? "" : "s"} hidden until discovered.`, listW), UI.muted, UI.panel)

  const detailX = listX + listW + 4
  const detailW = width - (detailX - x) - 4
  const detailH = height - 8
  drawPanel(canvas, detailX, listY - 1, detailW, detailH, "Quest Detail", UI.edge)
  if (!selectedQuest) return

  const progress = questProgress(model.session, selectedQuest.objectiveEventIds)
  canvas.write(detailX + 3, listY + 1, trim(selectedQuest.title, detailW - 6), selectedQuest.status === "completed" ? UI.focus : UI.gold, UI.panel)
  canvas.write(detailX + 3, listY + 3, trim(`Status ${selectedQuest.status}   Progress ${progress.completed}/${progress.total}`, detailW - 6), UI.soft, UI.panel)
  writeWrapped(canvas, detailX + 3, listY + 5, detailW - 6, [selectedQuest.summary], 3, UI.ink, UI.panel)

  const objectiveY = listY + 9
  canvas.write(detailX + 3, objectiveY, "Objectives", UI.brass, UI.panel)
  selectedQuest.objectiveEventIds.slice(0, Math.max(1, detailH - 12)).forEach((eventId, index) => {
    const event = model.session.world.events.find((item) => item.id === eventId)
    const status = event?.status ?? "future"
    const marker = status === "completed" ? "✓" : status === "active" ? "◆" : "·"
    const color = status === "completed" ? UI.focus : status === "active" ? UI.gold : UI.muted
    canvas.write(detailX + 3, objectiveY + 2 + index, marker, color, UI.panel)
    canvas.write(detailX + 6, objectiveY + 2 + index, trim(event?.title ?? eventId, detailW - 9), color, UI.panel)
  })
}

function drawQuestListRow(canvas: Canvas, x: number, y: number, width: number, model: AppModel, quest: GameSession["world"]["quests"][number], selected: boolean) {
  const progress = questProgress(model.session, quest.objectiveEventIds)
  const bg = selected ? cleanPanel3 : cleanPanel2
  canvas.fill(x, y, width, 2, " ", bg, bg)
  if (selected) drawCleanBox(canvas, x, y, width, 2, UI.gold, bg)
  if (selected) canvas.fill(x, y, 1, 2, " ", UI.gold, UI.gold)
  canvas.write(x + 2, y, trim(quest.title, width - 10), selected ? UI.gold : quest.status === "locked" ? UI.soft : UI.ink, bg)
  canvas.write(x + width - 6, y, `${progress.completed}/${progress.total}`, quest.status === "completed" ? UI.focus : UI.soft, bg)
  canvas.write(x + 2, y + 1, trim(quest.status, width - 4), quest.status === "active" ? UI.focus : UI.muted, bg)
}

function drawHubDialog(canvas: Canvas, model: AppModel, x: number, y: number, width: number, height: number) {
  const hub = model.session.hub
  const leftX = x + 4
  const topY = y + 4
  const leftW = Math.min(34, Math.floor((width - 10) * 0.38))
  const rightX = leftX + leftW + 4
  const rightW = width - (rightX - x) - 4

  canvas.write(leftX, y + 3, "Portal Room", UI.brass, UI.panel)
  drawPanel(canvas, leftX, topY, leftW, 7, "Status", UI.edgeDim)
  drawSettingRow(canvas, leftX + 2, topY + 2, leftW - 4, "Open", hub.unlocked ? "yes" : "locked")
  drawSettingRow(canvas, leftX + 2, topY + 4, leftW - 4, "Coins", String(hub.coins))
  drawSettingRow(canvas, leftX + 2, topY + 6, leftW - 4, "Houses", `${hub.houses.filter((house) => house.built).length}/${hub.houses.length}`)

  const farmY = topY + 9
  drawPanel(canvas, leftX, farmY, leftW, 7, "Farm", UI.edgeDim)
  drawSettingRow(canvas, leftX + 2, farmY + 2, leftW - 4, "Plots", String(hub.farm.plots))
  drawSettingRow(canvas, leftX + 2, farmY + 4, leftW - 4, "Planted", String(hub.farm.planted))
  drawSettingRow(canvas, leftX + 2, farmY + 6, leftW - 4, "Helpers", `${hub.helpers.pets} pets ${hub.helpers.butlers} butlers`)

  drawPanel(canvas, rightX, topY, rightW, Math.min(10, height - 7), "Stations", UI.edge)
  hubStationIds.slice(0, 6).forEach((id, index) => {
    const station = hub.stations[id]
    const rowY = topY + 2 + index
    const built = station.built ? `L${station.level}` : `${station.cost}c`
    const color = station.built ? UI.focus : hub.coins >= station.cost ? UI.gold : UI.soft
    canvas.write(rightX + 2, rowY, trim(station.name, Math.max(10, rightW - 20)), color, UI.panel)
    canvas.write(rightX + rightW - 10, rowY, trim(built, 8), color, UI.panel)
  })

  const trustY = topY + 11
  drawPanel(canvas, rightX, trustY, rightW, Math.max(7, height - (trustY - y) - 4), "Trust and Next Run", UI.edge)
  villageNpcIds.slice(0, 5).forEach((id, index) => {
    const trust = hub.trust[id]
    const rowY = trustY + 2 + index
    canvas.write(rightX + 2, rowY, trim(trust.name, Math.max(12, rightW - 18)), trust.level > 0 ? UI.focus : UI.soft, UI.panel)
    canvas.write(rightX + rightW - 12, rowY, trim(`T${trust.level} ${trust.xp}xp`, 10), trust.level > 0 ? UI.gold : UI.muted, UI.panel)
  })
  const food = hub.preparedFood[0] ?? "none"
  const weapon = model.session.equipment.weapon
  const mutators = hub.activeMutators.length ? hub.activeMutators.map(runMutatorShortLabel).join(", ") : "none"
  canvas.write(rightX + 2, trustY + 8, trim(`Food ${food}`, rightW - 4), UI.ink, UI.panel)
  canvas.write(rightX + 2, trustY + 9, trim(`Weapon ${weapon?.name ?? "none"}  dmg +${weapon?.bonusDamage ?? 0}`, rightW - 4), UI.ink, UI.panel)
  canvas.write(rightX + 2, trustY + 10, trim(`Mutators ${mutators}`, rightW - 4), UI.soft, UI.panel)
  if (!hub.unlocked) canvas.write(rightX + 2, trustY + 12, trim("Clear the dungeon or recover a deed to open village building.", rightW - 4), UI.gold, UI.panel)
  else canvas.write(rightX + 2, trustY + 12, trim("Keys: 1 smith, 2 kitchen, 3 sell, 4 food, 5 farm, 6 weapon, 7 quest, 8 hard.", rightW - 4), UI.gold, UI.panel)
}

function drawCutsceneDialog(canvas: Canvas, model: AppModel, x: number, y: number, width: number, height: number) {
  const hub = model.session.hub
  const scene = hub.cutscenes.find((candidate) => candidate.id === hub.lastCutsceneId) ?? hub.cutscenes.find((candidate) => candidate.seen) ?? hub.cutscenes[0]
  if (!scene) {
    canvas.write(x + 4, y + 4, "No local story scene has played yet.", UI.soft, UI.panel)
    return
  }
  drawMiniIcon(canvas, x + width - 14, y + 4, "focus-gem", 10, 3)
  canvas.write(x + 4, y + 4, trim(scene.title, width - 22), UI.gold, UI.panel)
  writeWrapped(canvas, x + 4, y + 7, width - 8, scene.lines, height - 11, UI.ink, UI.panel)
  const hint = scene.id === "waking-cell" ? "Enter begin descent  Esc skip. Camera preview points to the first lead." : "Enter close  Esc close. Scenes are saved in the Book."
  canvas.write(x + 4, y + height - 4, trim(hint, width - 8), UI.soft, UI.panel)
}

function runMutatorShortLabel(id: string) {
  return id.replace(/-/g, " ")
}

function drawRunSaveManagerDialog(canvas: Canvas, model: AppModel, x: number, y: number, width: number, height: number) {
  const listX = x + 4
  const listY = y + 4
  const listW = Math.min(38, Math.floor((width - 10) * 0.44))
  const rows = Math.max(4, Math.min(model.saves.length || 1, height - 10))
  const offset = scrollOffset(model.saveIndex, rows, model.saves.length)
  const selected = model.saves[clamp(model.saveIndex, 0, Math.max(0, model.saves.length - 1))]

  canvas.write(listX, y + 3, "Local Slots", UI.brass, UI.panel)
  drawScrollbar(canvas, listX + listW + 1, listY, rows, offset, rows, model.saves.length)
  if (!model.saves.length) canvas.write(listX, listY, "No saves yet. Press S.", UI.soft, UI.panel)
  model.saves.slice(offset, offset + rows).forEach((save, visibleIndex) => {
    const index = offset + visibleIndex
    const selectedRow = index === model.saveIndex
    const rowY = listY + visibleIndex
    const bg = selectedRow ? cleanPanel3 : cleanPanel2
    canvas.fill(listX, rowY, listW, 1, " ", bg, bg)
    if (selectedRow) canvas.fill(listX, rowY, 1, 1, " ", UI.gold, UI.gold)
    canvas.write(listX + 2, rowY, trim(save.name, listW - 13), selectedRow ? UI.gold : UI.ink, bg)
    canvas.write(listX + listW - 10, rowY, trim(save.slot, 8), save.slot === "autosave" ? UI.cyan : UI.soft, bg)
  })

  const detailX = listX + listW + 4
  const detailW = width - (detailX - x) - 4
  drawPanel(canvas, detailX, listY - 1, detailW, height - 8, "Selected", UI.edge)
  if (selected) {
    if (selected.thumbnail?.length) drawSaveThumbnail(canvas, detailX + 3, listY + 1, selected.thumbnail)
    canvas.write(detailX + 22, listY + 1, trim(selected.heroName, detailW - 25), UI.ink, UI.panel)
    canvas.write(detailX + 22, listY + 2, trim(`${selected.status}  LV ${selected.level}  F${selected.floor}/${selected.finalFloor}`, detailW - 25), UI.gold, UI.panel)
    canvas.write(detailX + 22, listY + 3, trim(formatSaveTime(selected.savedAt), detailW - 25), UI.soft, UI.panel)
    canvas.write(detailX + 3, listY + 9, trim(selected.path, detailW - 6), UI.muted, UI.panel)
  } else {
    canvas.write(detailX + 3, listY + 1, "Manual saves and autosaves appear here.", UI.soft, UI.panel)
  }
  canvas.write(detailX + 3, y + height - 6, trim("S save  Enter load  E rename  D delete  X export backup  R refresh", detailW - 6), UI.gold, UI.panel)
  if (model.saveStatus) canvas.write(detailX + 3, y + height - 4, trim(model.saveStatus, detailW - 6), UI.soft, UI.panel)
}

function playerAnimation(session: GameSession, moving = false): SpriteAnimationId {
  if (session.status === "dead") return "death"
  if (session.combat.active) return session.combat.lastRoll?.hit ? "attack-melee" : "idle"
  return moving ? "walk" : "idle"
}

function actorAnimation(selected: boolean, session: GameSession): SpriteAnimationId {
  if (selected) return "shocked"
  if (session.combat.active) return "idle"
  return "idle"
}

function classSprite(classId: HeroClass, appearance?: HeroAppearance): PixelSpriteId {
  return heroSpriteForAppearance(classId, appearance) as PixelSpriteId
}

function classOptionIcon(classId: HeroClass): PixelSpriteId {
  if (classId === "warden") return "shield"
  if (classId === "arcanist") return "staff"
  if (classId === "ranger") return "bow"
  if (classId === "duelist") return "dagger"
  if (classId === "cleric") return "focus-gem"
  if (classId === "engineer") return "lockpick"
  if (classId === "witch") return "ember"
  return "armor"
}

function actorSpriteId(kind: string): PixelSpriteId {
  if (kind === "merchant" || kind === "wound-surgeon") return "npc-smith"
  if (kind === "cartographer" || kind === "shrine-keeper" || kind === "jailer") return "npc-oracle"
  if (kind === "grave-root-boss") return "boss-minotaur"
  if (kind === "necromancer") return "necromancer"
  if (kind === "ghoul" || kind === "rust-squire" || kind === "crypt-mimic") return "ghoul"
  if (kind === "gallows-wisp" || kind === "carrion-moth") return "slime"
  return "slime"
}

function targetDefenseBonus(kind: string | undefined) {
  if (kind === "grave-root-boss") return 5
  if (kind === "necromancer") return 4
  if (kind === "crypt-mimic") return 3
  if (kind === "ghoul") return 2
  if (kind === "rust-squire" || kind === "gallows-wisp") return 1
  return 0
}

function drawDialog(canvas: Canvas, model: AppModel) {
  if (!model.dialog) return
  const { x, y, width, height } = dialogMetrics(model.dialog, canvas.width, canvas.height)
  drawDialogFrame(canvas, x, y, width, height, dialogTitle(model.dialog), model.dialog === "pause" ? null : dialogIcon(model.dialog), model.settings.diceSkin)

  if (model.dialog === "settings") {
    drawSettingRow(canvas, x + 4, y + 4, width - 8, "Seed", String(model.seed))
    drawSettingRow(canvas, x + 4, y + 6, width - 8, "Renderer", model.rendererBackend === "three" ? "@opentui/three preview disabled" : "opendungeon assets + terminal sprites")
    drawSettingRow(canvas, x + 4, y + 8, width - 8, "Camera", `${model.settings.tileScale} FOV, ${activeAssetPack.tileSize}px source actors`)
    drawSettingRow(canvas, x + 4, y + 10, width - 8, "UI", `${model.uiHidden ? "hidden now" : "visible now"}; overlay ${onOff(model.settings.showUi)}; minimap ${onOff(model.settings.showMinimap)}`)
    drawSettingRow(canvas, x + 4, y + 12, width - 8, "Save path", saveDirectory())
    drawSettingRow(canvas, x + 4, y + 14, width - 8, "Cloud", "Supabase auth session stored outside saves")
    drawSettingRow(canvas, x + 4, y + 16, width - 8, "Host", `bun run host -- --mode race --seed ${model.seed}`)
  }

  if (model.dialog === "inventory") {
    drawInventoryDialog(canvas, model)
    return
  }

  if (model.dialog === "book") {
    drawBookDialog(canvas, model, x, y, width, height)
  }

  if (model.dialog === "quests") {
    drawQuestsDialog(canvas, model, x, y, width, height)
  }

  if (model.dialog === "map") {
    drawRunMapDialog(canvas, model, x, y, width, height)
  }

  if (model.dialog === "hub") {
    drawHubDialog(canvas, model, x, y, width, height)
  }

  if (model.dialog === "saveManager") {
    drawRunSaveManagerDialog(canvas, model, x, y, width, height)
  }

  if (model.dialog === "cutscene") {
    drawCutsceneDialog(canvas, model, x, y, width, height)
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
      ["Save", "Ctrl+S or F5 saves locally; Esc then M opens run saves"],
      ["Pack", "I inventory, B book, M map, V village, J quests, O quests in Vim mode, H potion, L log"],
      ["Combat", "Tab target, 1-6 skill, F flee, Enter rolls d20"],
      ["Camera", "- wider FOV, = closer view"],
      ["Overlay", "U hides or shows the UI for this run"],
      ["Run", "R rest, Esc pause, Q close run"],
    ]
    rows.forEach((row, index) => {
      const rowY = y + 4 + index * 2
      drawKeycap(canvas, x + 4, rowY, row[0])
      canvas.write(x + 18, rowY, row[1], index === 3 ? UI.gold : UI.ink, UI.panel)
    })
  }

  if (model.dialog === "pause") {
    drawPixelBlock(canvas, x + 5, y + 5, animatedPixelSprite(classSprite(model.session.hero.classId, model.session.hero.appearance), "idle", model.session.turn, 14, 6), 0.9)
    canvas.write(x + 24, y + 4, "The dungeon holds your place.", UI.ink, UI.panel)
    drawPauseAction(canvas, x + 24, y + 6, width - 31, "Esc", "Resume", UI.focus)
    drawPauseAction(canvas, x + 24, y + 8, width - 31, "M", "Save manager", UI.cyan)
    drawPauseAction(canvas, x + 24, y + 10, width - 31, "S", "Settings", UI.cyan)
    drawPauseAction(canvas, x + 24, y + 12, width - 31, "T", "Quit to title", UI.gold)
    drawPauseAction(canvas, x + 24, y + 14, width - 31, "Q", "Close run", UI.hp)
  }

  if (model.dialog === "quit") {
    drawPixelBlock(canvas, x + 5, y + 5, animatedPixelSprite(classSprite(model.session.hero.classId, model.session.hero.appearance), "idle", model.session.turn, 14, 6), 0.9)
    canvas.write(x + 24, y + 4, "Quit this run?", UI.ink, UI.panel)
    writeWrapped(
      canvas,
      x + 24,
      y + 6,
      width - 31,
      ["The autosave slot keeps a recovery point, but the manual save is older than the current run state."],
      2,
      UI.soft,
      UI.panel,
    )
    drawPauseAction(canvas, x + 24, y + 9, width - 31, "S", "Save & Close", UI.focus)
    drawPauseAction(canvas, x + 24, y + 11, width - 31, "Q", "Close Anyway", UI.hp)
    drawPauseAction(canvas, x + 24, y + 13, width - 31, "Esc", "Cancel", UI.gold)
    if (model.saveStatus) canvas.write(x + 4, y + height - 4, trim(model.saveStatus, width - 8), UI.muted, UI.panel)
  }

  const footer = model.dialog === "pause" ? "resume" : model.dialog === "quit" ? "cancel" : "close"
  const footerText = `Esc ${footer}`
  const footerW = footerText.length + 4
  const footerX = x + Math.floor((width - footerW) / 2)
  canvas.fill(footerX, y + height - 2, footerW, 1, " ", cleanPanel3, cleanPanel3)
  canvas.write(footerX + 2, y + height - 2, "Esc", UI.gold, cleanPanel3)
  canvas.write(footerX + 6, y + height - 2, footer, UI.ink, cleanPanel3)
}

function drawPauseAction(canvas: Canvas, x: number, y: number, width: number, key: string, labelText: string, accent: string) {
  if (width < 18) return
  canvas.fill(x, y, width, 1, " ", cleanPanel2, cleanPanel2)
  drawKeycap(canvas, x + 1, y, key)
  canvas.write(x + 11, y, trim(labelText, width - 12), accent, cleanPanel2)
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

function drawScreenTransition(canvas: Canvas, transition: ScreenTransition) {
  if (transition.kind === "screen") return

  const elapsed = Date.now() - transition.startedAt
  const progress = clamp(elapsed / Math.max(1, transition.durationMs), 0, 1)
  if (progress >= 1) return

  const close = progress < 0.5 ? progress * 2 : (1 - progress) * 2
  const shadeRows = Math.ceil((1 - close) * canvas.height)
  const color = transition.kind === "portal" ? "#152d32" : "#18291c"
  for (let row = 0; row < shadeRows; row++) {
    const top = row
    const bottom = canvas.height - row - 1
    canvas.fill(0, top, canvas.width, 1, " ", color, color)
    if (bottom !== top) canvas.fill(0, bottom, canvas.width, 1, " ", color, color)
  }

  if (canvas.width >= 52 && canvas.height >= 18) {
    const width = Math.min(46, canvas.width - 8)
    const x = Math.floor((canvas.width - width) / 2)
    const y = Math.floor(canvas.height / 2) - 2
    const title = transition.kind === "portal" ? "PORTAL" : "VILLAGE"
    canvas.fill(x, y, width, 4, " ", "#05070a", "#05070a")
    canvas.border(x, y, width, 4, UI.focus)
    canvas.center(y + 1, trim(title, width - 4), UI.focus, "#05070a")
    canvas.center(y + 2, trim(transition.label, width - 4), UI.soft, "#05070a")
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

function formatInitiativeOrder(session: GameSession) {
  const enemies = (session.combat.initiative ?? [])
    .filter((entry) => entry.id !== "player")
    .slice(0, 4)
    .map((entry) => actorLabel(entry.kind))
  return ["You", ...enemies].join(" > ")
}

function startItemDisabled(item: string, model: AppModel) {
  return (item === "Multiplayer" || item === "Cloud login") && model.internetStatus !== "online"
}

function settingValue(model: AppModel, id: (typeof settingsOptions)[number]["id"]) {
  const settings = model.settings
  if (id === "username") return settings.username
  if (id === "showUi") return onOff(settings.showUi)
  if (id === "showMinimap") return onOff(settings.showMinimap)
  if (id === "runSeed") return String(model.session.seed)
  if (id === "runMode") return model.session.mode
  if (id === "runFloor") return `${model.session.floor}/${model.session.finalFloor}`
  if (id === "runTurn") return String(model.session.turn)
  if (id === "runAssets") return activeAssetPack.name
  if (id === "runSaves") return saveDirectory()
  if (id === "controlScheme") return settings.controlScheme
  if (id === "highContrast") return onOff(settings.highContrast)
  if (id === "reduceMotion") return onOff(settings.reduceMotion)
  if (id === "diceSkin") return diceSkinName(settings.diceSkin)
  if (id === "backgroundFx") return settings.backgroundFx
  if (id === "tileScale") return settings.tileScale
  if (id === "music") return onOff(settings.music)
  return onOff(settings.sound)
}

function settingSliderValues(id: SettingOption["id"]) {
  if (id === "tileScale") return ["overview", "wide", "medium", "close"]
  if (id === "backgroundFx") return ["low", "normal", "dense"]
  return ["off", "on"]
}

function settingSegments(id: SettingOption["id"], value: string) {
  if (id === "controlScheme") return ["hybrid", "arrows", "vim"]
  if (id === "diceSkin") return [value, ...diceSkinIds.map((id) => diceSkinName(id)).filter((name) => name !== value)]
  return ["off", "on"]
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
  if (width <= 0) return ""
  if (text.length <= width) return text
  if (width === 1) return "…"
  return `${text.slice(0, Math.max(0, width - 1))}…`
}

function trimInventoryLabel(text: string, width: number) {
  if (width <= 0) return ""
  if (text.length <= width) return text
  const words = text.split(/\s+/).filter(Boolean)
  const abbreviation = words.length > 1 ? words.map((word) => word[0]).join("").toUpperCase() : text
  if (abbreviation.length <= width) return abbreviation
  return trim(text, width)
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
