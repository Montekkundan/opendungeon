import { FrameBufferRenderable, createCliRenderer, type KeyEvent, type MouseEvent as OpenTuiMouseEvent } from "@opentui/core"
import {
  addToast,
  createSession,
  cycleTarget,
  chooseConversationOption,
  chooseLevelUpTalent,
  cycleConversationOption,
  attemptFlee,
  buildHubStation,
  cycleContentPack,
  cycleSharedFarmPermission,
  heroClassIds,
  completeVillageQuest,
  customizeVillageHouse,
  dismissSkillCheck,
  harvestFarm,
  interactWithWorld,
  isHeroClass,
  moveVillagePlayer,
  plantCrop,
  playLocalCutscene,
  prepareFood,
  performCombatAction,
  refreshBalanceDashboard,
  rest,
  resolveSkillCheck,
  runVillageShopSale,
  selectSkill,
  sellLootToVillage,
  toggleRunMutator,
  tryMove,
  upgradeWeapon,
  visitVillageLocation,
  unlockHub,
  usePotion,
  type GameSession,
  type HeroClass,
  type MultiplayerMode,
} from "./game/session.js"
import { deleteSave, exportSave, listSaves, loadSave, renameSave, saveAutosave, saveSession, type SaveSummary } from "./game/saveStore.js"
import { handleSaveCommand, saveCommandHelp } from "./game/saveCli.js"
import { loadSettings, saveSettings, type UserSettings } from "./game/settingsStore.js"
import { appearanceLabel, cycleCosmeticPalette, cycleHeroAnimationSet, cycleHeroWeaponSprite, cyclePortraitVariant, normalizeHeroAppearance } from "./game/appearance.js"
import { handleAssetsCommand, assetsCommandHelp } from "./assets/assetsCli.js"
import { diceSkinIds } from "./assets/diceSkins.js"
import { version } from "./version.js"
import {
  currentClass,
  currentMode,
  currentStartItem,
  currentStartItemDisabled,
  currentSettingItem,
  inventoryGridInfo,
  inventoryHitTest,
  moveSelection,
  moveSettingsTab,
  multiplayerModeForSelection,
  multiplayerSelectionIndexForMode,
  paint,
  tutorialTabCount,
  type AppModel,
  type PlayerMoveAnimation,
  type ScreenId,
  type ScreenTransition,
} from "./ui/screens.js"
import { shouldUseThreeRenderer } from "./rendering/threeAssets.js"
import { authHelpText, handleAuthCommand } from "./cloud/authCli.js"
import { formatTerminalCapabilityReport, terminalCapabilityReport } from "./system/terminalDoctor.js"
import { formatServerSetupReport, serverSetupReport } from "./system/serverSetupCheck.js"
import { handleSetupCommand } from "./system/firstRunSetup.js"
import { debugOverlaysEnabled } from "./system/debugFlags.js"
import { checkInternetConnectivity } from "./net/connectivity.js"

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`opendungeon ${version}

Terminal roguelike RPG built with OpenTUI.

Usage:
  opendungeon                   Start the game
  opendungeon login <username>  Prompt for a password and save an auth session
  opendungeon --login github    Open Supabase GitHub OAuth
  opendungeon saves list        List local saves for backup or maintenance
  opendungeon assets generate   Generate and store a sprite asset
  opendungeon setup             Create local first-run directories/profile
  opendungeon doctor            Check terminal size/color and recommended tile scale
  opendungeon setup-check       Check Supabase, AI Gateway, and asset storage env
  opendungeon --help            Show this help
  opendungeon --version         Show the version

Environment:
  OPENDUNGEON_SAVE_DIR     Override local save directory
  OPENDUNGEON_PROFILE_DIR  Override local profile/settings directory
  OPENDUNGEON_ASSET_DIR    Override bundled asset directory
  OPENDUNGEON_TILE_SCALE   overview | wide | medium | close
  OPENDUNGEON_DEBUG_OVERLAY=1 enables debug map/console overlays

${authHelpText()}
${saveCommandHelp()}
${assetsCommandHelp()}
`)
  process.exit(0)
}

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(`opendungeon ${version}`)
  process.exit(0)
}

const authExitCode = await handleAuthCommand(process.argv.slice(2))
if (authExitCode !== null) process.exit(authExitCode)
const saveExitCode = await handleSaveCommand(process.argv.slice(2))
if (saveExitCode !== null) process.exit(saveExitCode)
const assetsExitCode = await handleAssetsCommand(process.argv.slice(2))
if (assetsExitCode !== null) process.exit(assetsExitCode)
const setupExitCode = await handleSetupCommand(process.argv.slice(2))
if (setupExitCode !== null) process.exit(setupExitCode)

if (process.argv[2] === "doctor" || process.argv.includes("--doctor")) {
  console.log(formatTerminalCapabilityReport(terminalCapabilityReport()))
  process.exit(0)
}

if (process.argv[2] === "setup-check") {
  const report = serverSetupReport()
  console.log(formatServerSetupReport(report))
  process.exit(report.ready ? 0 : 1)
}

const initialSaves = listSaves()
const initialSettings = loadSettings()

const model: AppModel = {
  screen: "start",
  dialog: null,
  menuIndex: initialSaves.length ? 0 : 1,
  classIndex: classIndexFromEnv(),
  modeIndex: modeIndexFromEnv(),
  seed: seedFromEnv(),
  session: createSession(seedFromEnv(), modeFromEnv(), classFromEnv()),
  message: "",
  saves: initialSaves,
  saveIndex: 0,
  saveStatus: "",
  debugView: debugOverlaysEnabled(),
  rendererBackend: shouldUseThreeRenderer() ? "three" : "terminal",
  settings: initialSettings,
  settingsTabIndex: 0,
  settingsIndex: 0,
  settingsReturnScreen: "start",
  inputMode: null,
  uiHidden: !initialSettings.showUi,
  inventoryIndex: 0,
  inventoryDragIndex: null,
  bookIndex: 0,
  questIndex: 0,
  tutorialIndex: 0,
  internetStatus: "checking",
  animationFrame: 0,
  playerMoveAnimation: null,
  diceRollAnimation: null,
  screenTransition: null,
}
let submittedSession: GameSession | null = null
let diceTimer: ReturnType<typeof setTimeout> | null = null
let moveTimer: ReturnType<typeof setTimeout> | null = null
let transitionTimer: ReturnType<typeof setTimeout> | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null
let autosaveTimer: ReturnType<typeof setInterval> | null = null
let destroyed = false
let pendingDeleteSaveId: string | null = null
let lastAutosaveSignature = ""
let lastManualSaveSignature = ""
const toastCreatedAt = new Map<string, number>()
const toastTtlMs = 3200

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  screenMode: "alternate-screen",
  targetFps: 30,
  maxFps: 30,
  useMouse: true,
  enableMouseMovement: true,
  consoleMode: model.debugView ? "console-overlay" : "disabled",
  openConsoleOnError: model.debugView,
  backgroundColor: "#071014",
})
renderer.setTerminalTitle("opendungeon")

const screen = new FrameBufferRenderable(renderer, {
  id: "screen",
  position: "absolute",
  left: 0,
  top: 0,
  width: renderer.terminalWidth,
  height: renderer.terminalHeight,
  onMouseDown: handleMouseDown,
  onMouseDrag: handleMouseDrag,
  onMouseDragEnd: handleMouseDragEnd,
})

renderer.root.add(screen)
renderer.on("resize", refresh)
void refreshInternetStatus()
autosaveTimer = setInterval(() => autosaveCurrentRun("timer"), 30_000)
refresh()

renderer.keyInput.on("keypress", (key: KeyEvent) => {
  if (key.ctrl && key.name === "c") {
    destroyApp()
    return
  }

  if (model.inputMode) {
    handleInputKey(key)
    refresh()
    return
  }

  if (isSaveKey(key)) {
    saveCurrentRun()
    refresh()
    return
  }

  if (model.screen === "game" && model.session.skillCheck) {
    handleSkillCheckKey(key)
    autosaveCurrentRun()
    refresh()
    return
  }

  if (model.dialog) {
    handleDialogKey(key)
    if (model.screen === "game") autosaveCurrentRun()
    refresh()
    return
  }

  if (key.name === "q") {
    requestQuit()
    return
  }

  if (model.screen === "village") {
    handleVillageKey(key)
    autosaveCurrentRun()
    maybeSubmitLobbyResult()
    refresh()
    return
  }

  if (model.screen === "game") {
    handleGameKey(key)
    autosaveCurrentRun()
  } else handleMenuKey(key)

  maybeSubmitLobbyResult()
  refresh()
})

function handleDialogKey(key: KeyEvent) {
  if (model.dialog === "quit") {
    if (key.name === "s") {
      saveCurrentRun(true)
      destroyApp()
      return
    }
    if (key.name === "q") {
      destroyApp()
      return
    }
    if (key.name === "escape") {
      model.dialog = null
      return
    }
    return
  }

  if (model.dialog === "inventory") {
    handleInventoryKey(key)
    return
  }

  if (model.dialog === "book") {
    handleBookKey(key)
    return
  }

  if (model.dialog === "quests") {
    handleQuestsKey(key)
    return
  }

  if (model.dialog === "hub") {
    handleHubKey(key)
    return
  }

  if (model.dialog === "saveManager") {
    handleRunSaveManagerKey(key)
    return
  }

  if (model.dialog === "pause" && key.name === "s") {
    model.dialog = null
    openSettings("game")
    return
  }
  if (model.dialog === "pause" && key.name === "t") {
    model.dialog = null
    setScreen("start", "Returning to title.")
    model.menuIndex = 0
    model.diceRollAnimation = null
    return
  }
  if (model.dialog === "pause" && key.name === "q") {
    requestQuit()
    return
  }
  if (model.dialog === "pause" && key.name === "m") {
    refreshSaveList()
    model.dialog = "saveManager"
    return
  }
  if (key.name === "escape" || key.name === "return" || key.name === "enter" || key.name === "linefeed") model.dialog = null
}

function handleInventoryKey(key: KeyEvent) {
  if (key.name === "escape") {
    closeInventory()
    return
  }

  const grid = inventoryGridInfo(model, renderer.terminalWidth, renderer.terminalHeight)
  if (isLeftKey(key)) setInventoryIndex(model.inventoryIndex - 1)
  if (isRightKey(key)) setInventoryIndex(model.inventoryIndex + 1)
  if (isUpKey(key)) setInventoryIndex(model.inventoryIndex - grid.columns)
  if (isDownKey(key)) setInventoryIndex(model.inventoryIndex + grid.columns)
  if (isConfirmKey(key)) applySelectedInventoryItem()
}

function handleQuestsKey(key: KeyEvent) {
  const max = Math.max(0, model.session.world.quests.length - 1)
  if (key.name === "escape" || isConfirmKey(key)) {
    model.dialog = null
    return
  }
  if (isUpKey(key)) model.questIndex = clamp(model.questIndex - 1, 0, max)
  if (isDownKey(key)) model.questIndex = clamp(model.questIndex + 1, 0, max)
  if (key.name === "pageup") model.questIndex = clamp(model.questIndex - 5, 0, max)
  if (key.name === "pagedown") model.questIndex = clamp(model.questIndex + 5, 0, max)
}

function handleBookKey(key: KeyEvent) {
  const max = Math.max(0, model.session.knowledge.length - 1)
  if (key.name === "escape" || isConfirmKey(key)) {
    model.dialog = null
    return
  }
  if (isUpKey(key)) model.bookIndex = clamp(model.bookIndex - 1, 0, max)
  if (isDownKey(key)) model.bookIndex = clamp(model.bookIndex + 1, 0, max)
  if (key.name === "pageup") model.bookIndex = clamp(model.bookIndex - 5, 0, max)
  if (key.name === "pagedown") model.bookIndex = clamp(model.bookIndex + 5, 0, max)
}

function handleHubKey(key: KeyEvent) {
  if (key.name === "escape" || key.name === "return" || key.name === "enter" || key.name === "linefeed") {
    model.dialog = null
    return
  }
  if (key.name === "v" && model.session.hub.unlocked) {
    model.dialog = null
    setScreen("village", "Village road opens.", "village")
    return
  }
  if (key.name === "b") {
    refreshBalanceDashboard(model.session)
    model.saveStatus = model.session.log[0] ?? "Balance dashboard refreshed."
    return
  }
  if (key.name === "c") {
    cycleContentPack(model.session)
    model.saveStatus = model.session.log[0] ?? "Content pack changed."
    return
  }
  if (key.name === "n") {
    playLocalCutscene(model.session)
    model.dialog = "cutscene"
    return
  }
  if (key.name === "1") buildHubStation(model.session, "blacksmith")
  if (key.name === "2") buildHubStation(model.session, "kitchen")
  if (key.name === "3") sellLootToVillage(model.session)
  if (key.name === "4") prepareFood(model.session)
  if (key.name === "5") {
    if (!plantCrop(model.session)) harvestFarm(model.session)
  }
  if (key.name === "6") upgradeWeapon(model.session)
  if (key.name === "7") completeVillageQuest(model.session)
  if (key.name === "8") toggleRunMutator(model.session, "hard-mode")
  if (key.name === "9") toggleRunMutator(model.session, "cursed-floors")
  model.saveStatus = model.session.log[0] ?? "Hub updated."
}

function handleVillageKey(key: KeyEvent) {
  if (key.name === "escape") {
    setScreen("game", "Returning to dungeon.", "village")
    model.saveStatus = ""
    return
  }
  if (key.name === "?" || (key.shift && key.name === "/")) {
    model.dialog = "help"
    return
  }
  if (key.name === "m") {
    const sale = runVillageShopSale(model.session)
    model.saveStatus = sale?.reaction ?? model.session.log[0] ?? "No market sale."
    return
  }
  if (key.name === "h") {
    const house = customizeVillageHouse(model.session)
    model.saveStatus = `${house.name} customized.`
    return
  }
  if (key.name === "p") {
    model.saveStatus = `Farm permissions: ${cycleSharedFarmPermission(model.session)}.`
    return
  }
  if (key.name === "c") {
    const pack = cycleContentPack(model.session)
    model.saveStatus = `${pack.active} content pack selected.`
    return
  }
  if (key.name === "b") {
    const dashboard = refreshBalanceDashboard(model.session)
    model.saveStatus = `Balance: ${dashboard.classWinRate[model.session.hero.classId]}% ${model.session.hero.classId} projected win rate.`
    return
  }
  if (key.name === "n") {
    playLocalCutscene(model.session)
    model.dialog = "cutscene"
    return
  }
  if (isConfirmKey(key)) {
    const previousCutsceneId = model.session.hub.lastCutsceneId
    const result = visitVillageLocation(model.session)
    model.saveStatus = String(result)
    if (model.session.hub.lastCutsceneId && model.session.hub.lastCutsceneId !== previousCutsceneId) model.dialog = "cutscene"
    return
  }
  const move = movementForKey(key, model.settings)
  if (move) {
    const selected = moveVillagePlayer(model.session, move.dx, move.dy)
    model.saveStatus = `${selected.replace(/-/g, " ")} selected.`
  }
}

function handleRunSaveManagerKey(key: KeyEvent) {
  if (key.name === "escape") {
    model.dialog = "pause"
    pendingDeleteSaveId = null
    return
  }
  if (isUpKey(key)) {
    pendingDeleteSaveId = null
    model.saveIndex = wrapSaveIndex(model.saveIndex - 1)
  }
  if (isDownKey(key)) {
    pendingDeleteSaveId = null
    model.saveIndex = wrapSaveIndex(model.saveIndex + 1)
  }
  if (key.name === "r") {
    pendingDeleteSaveId = null
    refreshSaveList()
  }
  if (key.name === "s") saveCurrentRun()
  if (key.name === "e") startInput("saveName")
  if (key.name === "d") deleteSelectedSave()
  if (key.name === "x") exportSelectedSaveBackup()
  if (isConfirmKey(key)) loadSelectedSave()
}

function handleMouseDown(event: OpenTuiMouseEvent) {
  if (model.dialog !== "inventory") return
  const hit = inventoryHitTest(model, renderer.terminalWidth, renderer.terminalHeight, event.x, event.y)
  if (!hit) return
  event.preventDefault()
  event.stopPropagation()

  if (hit.kind === "close") closeInventory()
  if (hit.kind === "apply") applySelectedInventoryItem()
  if (hit.kind === "slot") {
    setInventoryIndex(hit.index)
    model.inventoryDragIndex = model.session.inventory[hit.index] ? hit.index : null
  }
  refresh()
}

function handleMouseDrag(event: OpenTuiMouseEvent) {
  if (model.dialog !== "inventory" || model.inventoryDragIndex === null) return
  const hit = inventoryHitTest(model, renderer.terminalWidth, renderer.terminalHeight, event.x, event.y)
  if (hit?.kind !== "slot") return
  event.preventDefault()
  event.stopPropagation()
  setInventoryIndex(hit.index)
  refresh()
}

function handleMouseDragEnd(event: OpenTuiMouseEvent) {
  if (model.dialog !== "inventory" || model.inventoryDragIndex === null) return
  const source = model.inventoryDragIndex
  model.inventoryDragIndex = null
  const hit = inventoryHitTest(model, renderer.terminalWidth, renderer.terminalHeight, event.x, event.y)
  if (hit?.kind === "slot") moveInventoryItem(source, hit.index)
  event.preventDefault()
  event.stopPropagation()
  refresh()
}

function closeInventory() {
  model.dialog = null
  model.inventoryDragIndex = null
  model.message = ""
}

function setInventoryIndex(index: number) {
  const grid = inventoryGridInfo(model, renderer.terminalWidth, renderer.terminalHeight)
  model.inventoryIndex = clamp(index, 0, Math.max(0, grid.slotCount - 1))
}

function applySelectedInventoryItem() {
  const index = clamp(model.inventoryIndex, 0, Math.max(0, model.session.inventory.length - 1))
  const item = model.session.inventory[index]
  if (!item) {
    model.message = "No item selected."
    return
  }

  if (item === "Deploy nerve potion") {
    usePotion(model.session)
    model.message = model.session.log[0] ?? "Potion applied."
    setInventoryIndex(index)
    return
  }

  if (/vial|potion/i.test(item) && model.session.status === "running" && !model.session.skillCheck) {
    model.session.inventory.splice(index, 1)
    model.session.hp = Math.min(model.session.maxHp, model.session.hp + 3)
    pushSessionLog(`${item} applied. A little health returns.`)
    addToast(model.session, "Item used", `${item} restored a little health.`, "success")
    model.message = model.session.log[0] ?? `${item} applied.`
    setInventoryIndex(index)
    return
  }

  model.message = `${item} selected. No apply action yet.`
}

function moveInventoryItem(source: number, target: number) {
  if (source < 0 || source >= model.session.inventory.length) return
  const [item] = model.session.inventory.splice(source, 1)
  const destination = clamp(target, 0, model.session.inventory.length)
  model.session.inventory.splice(destination, 0, item)
  model.inventoryIndex = destination
  model.message = `${item} moved.`
}

function pushSessionLog(message: string) {
  model.session.log.unshift(message)
  while (model.session.log.length > 8) model.session.log.pop()
}

function handleSkillCheckKey(key: KeyEvent) {
  const check = model.session.skillCheck
  if (!check) return
  if (check.status === "pending") {
    if (isConfirmKey(key)) {
      const roll = resolveSkillCheck(model.session)
      if (roll) startDiceRollAnimation(roll.d20)
    }
    return
  }

  if (isConfirmKey(key) || key.name === "escape") dismissSkillCheck(model.session)
}

function handleMenuKey(key: KeyEvent) {
  if (model.screen === "saves") {
    if (isUpKey(key)) {
      pendingDeleteSaveId = null
      moveSelection(model, -1)
    }
    if (isDownKey(key)) {
      pendingDeleteSaveId = null
      moveSelection(model, 1)
    }
    if (key.name === "r") {
      pendingDeleteSaveId = null
      refreshSaveList()
    }
    if (key.name === "e") startInput("saveName")
    if (key.name === "d") deleteSelectedSave()
    if (key.name === "escape") {
      pendingDeleteSaveId = null
      setScreen("start", "Save browser closed.")
      model.menuIndex = 0
    }
    if (isConfirmKey(key)) loadSelectedSave()
    return
  }

  if (model.screen === "cloud") {
    if (isUpKey(key)) moveSelection(model, -1)
    if (isDownKey(key)) moveSelection(model, 1)
    if (key.name === "u") startInput("githubUsername")
    if (key.name === "escape") {
      setScreen("start", "Cloud profile closed.")
      model.menuIndex = 0
    }
    if (isConfirmKey(key)) confirmCloud()
    return
  }

  if (model.screen === "settings") {
    if (isLeftKey(key) || key.name === "[") {
      moveSettingsTab(model, -1)
      return
    }
    if (isRightKey(key) || key.name === "]") {
      moveSettingsTab(model, 1)
      return
    }
    if (isUpKey(key)) moveSelection(model, -1)
    if (isDownKey(key)) moveSelection(model, 1)
    if (key.name === "u") startInput("username")
    if (key.name === "c") {
      setScreen("controls", "Opening controls.")
      model.menuIndex = 0
    }
    if (key.name === "escape") closeSettings()
    if (isConfirmKey(key)) changeCurrentSetting()
    return
  }

  if (model.screen === "controls") {
    if (key.name === "s") openSettings(model.settingsReturnScreen)
    if (key.name === "escape" || isConfirmKey(key)) {
      setScreen(model.settingsReturnScreen === "game" ? "game" : "start", "Controls closed.")
      model.menuIndex = 0
    }
    return
  }

  if (model.screen === "tutorial") {
    if (isUpKey(key) || isLeftKey(key)) {
      moveSelection(model, -1)
      model.tutorialIndex = model.menuIndex
    }
    if (isDownKey(key) || isRightKey(key)) {
      moveSelection(model, 1)
      model.tutorialIndex = model.menuIndex
    }
    if (key.name === "pageup") model.tutorialIndex = clamp(model.tutorialIndex - 3, 0, tutorialTabCount() - 1)
    if (key.name === "pagedown") model.tutorialIndex = clamp(model.tutorialIndex + 3, 0, tutorialTabCount() - 1)
    model.menuIndex = model.tutorialIndex
    if (key.name === "escape" || isConfirmKey(key)) {
      setScreen("start", "Tutorial closed.")
      model.menuIndex = 0
    }
    return
  }

  if (model.screen === "character") {
    if (key.name === "n") {
      startInput("characterName")
      return
    }
    if (key.name === "[" || key.name === "]") {
      model.session.hero.appearance = cycleCosmeticPalette(currentClass(model).id, model.session.hero.appearance, key.name === "[" ? -1 : 1)
      model.saveStatus = appearanceLabel(model.session.hero.appearance)
      return
    }
    if (key.name === "p") {
      model.session.hero.appearance = cyclePortraitVariant(currentClass(model).id, model.session.hero.appearance, 1)
      model.saveStatus = appearanceLabel(model.session.hero.appearance)
      return
    }
    if (key.name === "w") {
      model.session.hero.appearance = cycleHeroWeaponSprite(currentClass(model).id, model.session.hero.appearance, 1)
      model.saveStatus = appearanceLabel(model.session.hero.appearance)
      return
    }
    if (key.name === "a") {
      model.session.hero.appearance = cycleHeroAnimationSet(currentClass(model).id, model.session.hero.appearance, 1)
      model.saveStatus = appearanceLabel(model.session.hero.appearance)
      return
    }
  }

  if (isUpKey(key)) moveSelection(model, -1)
  if (isDownKey(key)) moveSelection(model, 1)
  if (model.screen === "start" && key.name === "c") loadLatestSave()
  if (model.screen === "start" && key.name === "n") model.seed = randomSeed()
  if (model.screen === "start" && key.name === "t") {
    setScreen("tutorial", "Opening tutorial.")
    model.menuIndex = model.tutorialIndex
    return
  }
  if (key.name === "escape") {
    setScreen("start", "Back to title.")
    model.menuIndex = 0
  }
  if (key.name === "?" || (key.shift && key.name === "/")) model.dialog = "help"
  if (isConfirmKey(key)) confirmMenu()
}

function handleGameKey(key: KeyEvent) {
  if (model.session.status !== "running") {
    if (key.name === "v") {
      if (model.session.hub.unlocked) setScreen("village", "Village road opens.", "village")
      else model.dialog = "hub"
      return
    }
    if (isConfirmKey(key)) startRun()
    if (key.name === "escape") {
      setScreen("start", "Returning to title.")
      model.menuIndex = 0
    }
    return
  }

  if (model.session.levelUp) {
    handleLevelUpKey(key)
    return
  }

  if (model.session.conversation && !model.session.combat.active && !model.session.skillCheck) {
    if (/^[1-3]$/.test(key.name)) {
      chooseConversationOption(model.session, Number(key.name) - 1)
      return
    }
    if (isLeftKey(key) || isUpKey(key)) {
      cycleConversationOption(model.session, -1)
      return
    }
    if (isRightKey(key) || isDownKey(key)) {
      cycleConversationOption(model.session, 1)
      return
    }
  }

  if (key.name === "escape") {
    model.dialog = "pause"
    return
  }
  if (key.name === "i") {
    model.dialog = "inventory"
    model.message = ""
    setInventoryIndex(model.inventoryIndex)
    return
  }
  if (key.name === "l") {
    model.dialog = "log"
    return
  }
  if (key.name === "b") {
    model.dialog = "book"
    model.bookIndex = clamp(model.bookIndex, 0, Math.max(0, model.session.knowledge.length - 1))
    return
  }
  if (key.name === "v") {
    if (!model.session.hub.unlocked && model.session.knowledge.some((entry) => entry.title.includes("Village Deed"))) unlockHub(model.session, "Village deed opened the portal room.")
    if (model.session.hub.unlocked) {
      model.dialog = null
      setScreen("village", "Village road opens.", "village")
      return
    }
    startScreenTransition(model.screen, model.screen, "Village path is still locked.", "village")
    model.dialog = "hub"
    return
  }
  if (key.name === "o" || (key.name === "j" && model.settings.controlScheme !== "vim")) {
    model.dialog = "quests"
    model.questIndex = clamp(model.questIndex, 0, Math.max(0, model.session.world.quests.length - 1))
    return
  }
  if (key.name === "r") {
    rest(model.session)
    return
  }
  if (key.name === "h") {
    usePotion(model.session)
    return
  }
  if (key.name === "?" || (key.shift && key.name === "/")) {
    model.dialog = "help"
    return
  }
  if (key.name === "e" || isConfirmKey(key)) {
    interactWithWorld(model.session)
    return
  }
  if (key.name === "u") {
    toggleRunUi()
    return
  }
  if (key.name === "-" || key.sequence === "-") {
    adjustMapScale(-1)
    return
  }
  if (key.name === "=" || key.sequence === "=" || key.sequence === "+") {
    adjustMapScale(1)
    return
  }

  if (model.session.combat.active) {
    handleCombatKey(key)
    return
  }

  const move = movementForKey(key, model.settings)
  if (move) {
    const before = { ...model.session.player }
    tryMove(model.session, move.dx, move.dy)
    if (before.x !== model.session.player.x || before.y !== model.session.player.y) startPlayerMoveAnimation(moveDirection(move.dx, move.dy))
  }
}

function handleLevelUpKey(key: KeyEvent) {
  if (/^[1-3]$/.test(key.name)) {
    chooseLevelUpTalent(model.session, Number(key.name) - 1)
    return
  }
  if (isConfirmKey(key)) chooseLevelUpTalent(model.session, 0)
}

function handleCombatKey(key: KeyEvent) {
  if (key.name === "tab" || isRightKey(key) || key.name === "d") {
    cycleTarget(model.session, 1)
    return
  }
  if (isLeftKey(key) || key.name === "a") {
    cycleTarget(model.session, -1)
    return
  }
  if (isDownKey(key) || key.name === "s") {
    cycleCombatSkill(1)
    return
  }
  if (isUpKey(key) || key.name === "w") {
    cycleCombatSkill(-1)
    return
  }
  if (/^[1-6]$/.test(key.name)) {
    selectSkill(model.session, Number(key.name) - 1)
    return
  }
  if (key.name === "f") {
    const roll = attemptFlee(model.session)
    if (roll) startDiceRollAnimation(roll.d20)
    return
  }
  if (isConfirmKey(key)) {
    const previousRoll = model.session.combat.lastRoll
    performCombatAction(model.session)
    const nextRoll = model.session.combat.lastRoll
    if (nextRoll && nextRoll !== previousRoll) startDiceRollAnimation(nextRoll.d20)
  }
}

function cycleCombatSkill(delta: number) {
  const count = 6
  const current = model.session.combat.selectedSkill
  selectSkill(model.session, ((current + delta) % count + count) % count)
}

function confirmMenu() {
  if (model.screen === "start") {
    if (currentStartItemDisabled(model)) {
      model.saveStatus = model.internetStatus === "checking" ? "Checking internet before enabling network features." : "Offline: multiplayer, cloud, and AI admin sync are disabled."
      void refreshInternetStatus()
      return
    }
    const item = currentStartItem(model)
    if (item === "Continue last") loadLatestSave()
    if (item === "New descent") startRun()
    if (item === "Load save") openSaveBrowser()
    if (item === "Character") {
      setScreen("character", "Choosing crawler.")
      model.menuIndex = model.classIndex
    }
    if (item === "Multiplayer") {
      setScreen("mode", "Choosing run mode.")
      model.menuIndex = multiplayerSelectionIndexForMode(currentMode(model).id)
    }
    if (item === "Cloud login") {
      setScreen("cloud", "Opening cloud profile.")
      model.menuIndex = 0
    }
    if (item === "Tutorial") {
      setScreen("tutorial", "Opening tutorial.")
      model.menuIndex = model.tutorialIndex
    }
    if (item === "Settings") openSettings("start")
    if (item === "Controls") {
      setScreen("controls", "Opening controls.")
      model.menuIndex = 0
      model.settingsReturnScreen = "start"
    }
    if (item === "Quit") destroyApp()
    return
  }

  if (model.screen === "character") {
    model.classIndex = model.menuIndex
    model.session.hero.appearance = normalizeHeroAppearance(currentClass(model).id, model.session.hero.appearance)
    setScreen("start", "Crawler selected.")
    model.menuIndex = 0
    return
  }

  if (model.screen === "mode") {
    model.modeIndex = modeIndexFor(multiplayerModeForSelection(model.menuIndex).id)
    setScreen("start", "Run mode selected.")
    model.menuIndex = 0
  }
}

function startRun() {
  model.session = createSession(model.seed, currentMode(model).id, currentClass(model).id, model.session.hero.name, model.session.hero.appearance)
  submittedSession = null
  setScreen("game", "The descent opens.", "portal")
  model.dialog = null
  model.uiHidden = !model.settings.showUi
  model.bookIndex = 0
  model.saveStatus = "New run started. Press Ctrl+S or F5 to save locally."
  lastManualSaveSignature = ""
  autosaveCurrentRun("new-run")
}

function openSaveBrowser() {
  refreshSaveList()
  setScreen("saves", "Opening local saves.")
  model.menuIndex = 0
}

function refreshSaveList() {
  model.saves = listSaves()
  model.saveIndex = clamp(model.saveIndex, 0, Math.max(0, model.saves.length - 1))
  model.saveStatus = model.saves.length ? `${model.saves.length} local save${model.saves.length === 1 ? "" : "s"} found.` : "No local saves found yet."
}

function loadSelectedSave() {
  const summary = model.saves[model.saveIndex]
  if (!summary) {
    model.saveStatus = "No local save selected."
    return
  }

  try {
    pendingDeleteSaveId = null
    const session = loadSave(summary.id)
    session.log.unshift(`Loaded local save: ${summary.name}.`)
    while (session.log.length > 8) session.log.pop()
    model.session = session
    model.seed = session.seed
    model.classIndex = classIndexFor(session.hero.classId)
    model.modeIndex = modeIndexFor(session.mode)
    setScreen("game", "Loaded run opens.", "portal")
    model.dialog = null
    model.diceRollAnimation = null
    model.uiHidden = !model.settings.showUi
    model.saveStatus = `Loaded ${summary.name}.`
    submittedSession = null
    lastAutosaveSignature = autosaveSignature(model.session)
    lastManualSaveSignature = summary.slot === "autosave" ? "" : lastAutosaveSignature
  } catch (error) {
    const status = error instanceof Error ? error.message : "Save failed to load."
    refreshSaveList()
    model.saveStatus = status
  }
}

function deleteSelectedSave() {
  const summary = model.saves[model.saveIndex]
  if (!summary) {
    model.saveStatus = "No local save selected."
    return
  }

  if (pendingDeleteSaveId !== summary.id) {
    pendingDeleteSaveId = summary.id
    model.saveStatus = `Press d again to delete ${summary.name}.`
    return
  }

  try {
    deleteSave(summary.id)
    pendingDeleteSaveId = null
    refreshSaveList()
    model.saveStatus = `Deleted ${summary.name}.`
  } catch (error) {
    pendingDeleteSaveId = null
    model.saveStatus = error instanceof Error ? error.message : "Save delete failed."
  }
}

function exportSelectedSaveBackup() {
  const summary = model.saves[model.saveIndex]
  if (!summary) {
    model.saveStatus = "No local save selected."
    return
  }

  try {
    const exported = exportSave(summary.id, `${summary.path}.backup.json`)
    model.saveStatus = `Exported backup for ${exported.name}.`
  } catch (error) {
    model.saveStatus = error instanceof Error ? error.message : "Save export failed."
  }
}

function wrapSaveIndex(index: number) {
  return ((index % Math.max(1, model.saves.length)) + Math.max(1, model.saves.length)) % Math.max(1, model.saves.length)
}

function loadLatestSave() {
  refreshSaveList()
  if (!model.saves.length) {
    model.saveStatus = "No local saves yet. Start a descent and press Ctrl+S or F5."
    model.menuIndex = 1
    return
  }

  model.saveIndex = 0
  loadSelectedSave()
}

function saveCurrentRun(skipFollowupAutosave = false) {
  if (model.screen !== "game") return
  try {
    const summary = saveSession(model.session)
    model.saves = listSaves()
    model.saveIndex = indexForSave(model.saves, summary)
    model.saveStatus = `Saved locally: ${summary.name}.`
    model.session.log.unshift(`Saved locally: ${summary.name}.`)
    while (model.session.log.length > 8) model.session.log.pop()
    lastManualSaveSignature = autosaveSignature(model.session)
    if (!skipFollowupAutosave) autosaveCurrentRun("manual-save")
  } catch (error) {
    model.saveStatus = error instanceof Error ? error.message : "Manual save failed."
  }
}

function autosaveCurrentRun(_reason = "change") {
  if (model.screen !== "game") return
  const signature = autosaveSignature(model.session)
  if (signature === lastAutosaveSignature) return
  try {
    const summary = saveAutosave(model.session)
    lastAutosaveSignature = signature
    model.saves = listSaves()
    model.saveIndex = indexForSave(model.saves, summary)
  } catch (error) {
    model.saveStatus = error instanceof Error ? error.message : "Autosave failed."
  }
}

function confirmCloud() {
  if (model.menuIndex === 0) {
    if (!model.settings.githubUsername) {
      startInput("githubUsername")
      return
    }
    model.settings.cloudProvider = "github"
    saveUserSettings("GitHub profile selected. Device login is still on the roadmap.")
    return
  }

  if (model.menuIndex === 1) {
    model.settings.cloudProvider = "local"
    saveUserSettings("Local profile selected. Cloud sync remains off.")
    return
  }

  setScreen("start", "Cloud profile closed.")
  model.menuIndex = 0
}

function openSettings(returnScreen: AppModel["settingsReturnScreen"]) {
  setScreen("settings", "Opening settings.")
  model.settingsReturnScreen = returnScreen
  model.settingsIndex = 0
  model.menuIndex = model.settingsIndex
}

function closeSettings() {
  model.inputMode = null
  setScreen(model.settingsReturnScreen === "game" ? "game" : "start", "Settings closed.")
  model.menuIndex = 0
}

function changeCurrentSetting() {
  const item = currentSettingItem(model)
  if (item.control === "readonly") {
    model.saveStatus = `${item.name}: ${item.id === "runSaves" ? "shown in settings" : "run detail"}`
    return
  }
  if (item.id === "username") {
    startInput("username")
    return
  }
  if (item.id === "controlScheme") model.settings.controlScheme = cycleValue(model.settings.controlScheme, ["hybrid", "arrows", "vim"])
  if (item.id === "highContrast") model.settings.highContrast = !model.settings.highContrast
  if (item.id === "reduceMotion") model.settings.reduceMotion = !model.settings.reduceMotion
  if (item.id === "showUi") {
    model.settings.showUi = !model.settings.showUi
    model.uiHidden = !model.settings.showUi
  }
  if (item.id === "showMinimap") model.settings.showMinimap = !model.settings.showMinimap
  if (item.id === "diceSkin") model.settings.diceSkin = cycleValue(model.settings.diceSkin, diceSkinIds)
  if (item.id === "backgroundFx") model.settings.backgroundFx = cycleValue(model.settings.backgroundFx, ["low", "normal", "dense"])
  if (item.id === "tileScale") model.settings.tileScale = cycleValue(model.settings.tileScale, mapScaleOptions)
  if (item.id === "music") model.settings.music = !model.settings.music
  if (item.id === "sound") model.settings.sound = !model.settings.sound
  saveUserSettings("Settings saved locally.")
}

function startInput(field: NonNullable<AppModel["inputMode"]>["field"]) {
  model.inputMode = {
    field,
    draft:
      field === "username"
        ? model.settings.username
        : field === "githubUsername"
          ? model.settings.githubUsername
          : field === "characterName"
            ? model.session.hero.name
            : model.saves[model.saveIndex]?.name ?? "",
  }
}

function handleInputKey(key: KeyEvent) {
  const input = model.inputMode
  if (!input) return

  if (key.name === "escape") {
    model.inputMode = null
    return
  }
  if (isConfirmKey(key)) {
    const value = input.field === "saveName" ? cleanSaveInputText(input.draft) : input.field === "characterName" ? cleanCharacterName(input.draft) : cleanProfileText(input.draft)
    if (input.field === "username") model.settings.username = value || "local-crawler"
    if (input.field === "characterName") model.session.hero.name = value || "Mira"
    if (input.field === "githubUsername") {
      model.settings.githubUsername = value
      if (value) model.settings.cloudProvider = "github"
    }
    if (input.field === "saveName") {
      const selected = model.saves[model.saveIndex]
      if (selected) {
        const renamed = renameSave(selected.id, value || selected.name)
        refreshSaveList()
        model.saveIndex = indexForSave(model.saves, renamed)
        model.saveStatus = `Renamed ${renamed.name}.`
      }
    }
    model.inputMode = null
    if (input.field === "username" || input.field === "githubUsername") saveUserSettings(`${input.field === "username" ? "Player name" : "GitHub profile"} saved locally.`)
    if (input.field === "characterName") model.saveStatus = `Crawler name set to ${model.session.hero.name}.`
    return
  }
  if (key.name === "backspace" || key.name === "delete") {
    input.draft = input.draft.slice(0, -1)
    return
  }
  if (key.ctrl || key.meta || key.option) return
  const text = key.sequence && key.sequence.length === 1 ? key.sequence : ""
  const limit = input.field === "saveName" ? 80 : 24
  if (/^[\w .:/'()-]$/.test(text) && input.draft.length < limit) input.draft += text
}

function saveUserSettings(status: string) {
  saveSettings(model.settings)
  model.saveStatus = status
}

function toggleRunUi() {
  model.uiHidden = !model.uiHidden
  model.session.log.unshift(model.uiHidden ? "UI hidden for this run. Press U to show it." : "UI shown for this run. Press U to hide it.")
  while (model.session.log.length > 8) model.session.log.pop()
}

const mapScaleOptions: UserSettings["tileScale"][] = ["overview", "wide", "medium", "close"]

function adjustMapScale(delta: number) {
  const index = mapScaleOptions.indexOf(model.settings.tileScale)
  const next = mapScaleOptions[clamp(index + delta, 0, mapScaleOptions.length - 1)] ?? "wide"
  if (next === model.settings.tileScale) return
  model.settings.tileScale = next
  saveUserSettings(`Camera FOV set to ${next}.`)
}

function setScreen(screen: ScreenId, label: string, kind: ScreenTransition["kind"] = "screen") {
  const from = model.screen
  if (from === screen) return
  model.screen = screen
  if (kind === "screen") {
    model.screenTransition = null
    return
  }
  startScreenTransition(from, screen, label, kind)
}

function startScreenTransition(from: ScreenId, to: ScreenId, label: string, kind: ScreenTransition["kind"]) {
  if (kind === "screen" || model.settings.reduceMotion) {
    model.screenTransition = null
    return
  }
  model.screenTransition = {
    from,
    to,
    label,
    kind,
    startedAt: Date.now(),
    durationMs: kind === "portal" || kind === "village" ? 620 : 420,
  }
  queueScreenTransitionFrame()
}

function queueScreenTransitionFrame() {
  if (transitionTimer || destroyed) return
  transitionTimer = setTimeout(() => {
    transitionTimer = null
    const transition = model.screenTransition
    if (!transition || destroyed) return
    const done = Date.now() - transition.startedAt >= transition.durationMs
    if (done) model.screenTransition = null
    refresh()
    if (!done) queueScreenTransitionFrame()
  }, 33)
}

function refresh() {
  if (destroyed) return
  syncToastLifetimes()
  const width = renderer.terminalWidth
  const height = renderer.terminalHeight
  if (screen.width !== width) screen.width = width
  if (screen.height !== height) screen.height = height
  if (screen.frameBuffer.width !== width || screen.frameBuffer.height !== height) screen.frameBuffer.resize(width, height)
  paint(model, width, height, screen.frameBuffer)
  renderer.requestRender()
  if (model.screen === "game" && model.session.toasts.length) queueToastFrame()
}

function syncToastLifetimes() {
  const now = Date.now()
  for (const toast of model.session.toasts) {
    if (!toastCreatedAt.has(toast.id)) toastCreatedAt.set(toast.id, now)
  }
  model.session.toasts = model.session.toasts.filter((toast, index) => {
    const created = toastCreatedAt.get(toast.id) ?? now
    return now - created < toastTtlMs + index * 450
  })
  const activeIds = new Set(model.session.toasts.map((toast) => toast.id))
  for (const id of toastCreatedAt.keys()) {
    if (!activeIds.has(id)) toastCreatedAt.delete(id)
  }
}

function queueToastFrame() {
  if (toastTimer || destroyed) return
  toastTimer = setTimeout(() => {
    toastTimer = null
    syncToastLifetimes()
    refresh()
    if (model.session.toasts.length) queueToastFrame()
  }, 250)
}

function startDiceRollAnimation(result: number) {
  model.diceRollAnimation = {
    result,
    startedAt: Date.now(),
    durationMs: 820,
  }
  queueDiceAnimationFrame()
}

function queueDiceAnimationFrame() {
  if (diceTimer || destroyed) return
  diceTimer = setTimeout(() => {
    diceTimer = null
    const animation = model.diceRollAnimation
    if (!animation || destroyed) return

    const done = Date.now() - animation.startedAt >= animation.durationMs
    if (done) model.diceRollAnimation = null
    refresh()
    if (!done) queueDiceAnimationFrame()
  }, 33)
}

function startPlayerMoveAnimation(direction: PlayerMoveAnimation["direction"]) {
  if (model.settings.reduceMotion) return
  model.animationFrame = 0
  model.playerMoveAnimation = {
    startedAt: Date.now(),
    durationMs: 320,
    direction,
  }
  queuePlayerMoveAnimationFrame()
}

function queuePlayerMoveAnimationFrame() {
  if (moveTimer || destroyed) return
  moveTimer = setTimeout(() => {
    moveTimer = null
    const animation = model.playerMoveAnimation
    if (!animation || destroyed) return

    const done = Date.now() - animation.startedAt >= animation.durationMs
    if (done) model.playerMoveAnimation = null
    else model.animationFrame = (model.animationFrame + 1) % 100000
    refresh()
    if (!done) queuePlayerMoveAnimationFrame()
  }, 70)
}

function requestQuit() {
  if (model.screen === "game" && model.session.status === "running" && hasUnsavedManualChanges()) {
    model.dialog = "quit"
    model.saveStatus = lastAutosaveSignature === autosaveSignature(model.session) ? "Autosave is current; manual save is older." : "This run has not been saved yet."
    refresh()
    return
  }
  destroyApp()
}

function hasUnsavedManualChanges() {
  return lastManualSaveSignature !== autosaveSignature(model.session)
}

function destroyApp() {
  destroyed = true
  if (diceTimer) clearTimeout(diceTimer)
  diceTimer = null
  if (moveTimer) clearTimeout(moveTimer)
  moveTimer = null
  if (transitionTimer) clearTimeout(transitionTimer)
  transitionTimer = null
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = null
  if (autosaveTimer) clearInterval(autosaveTimer)
  autosaveTimer = null
  renderer.destroy()
}

async function refreshInternetStatus() {
  const status = await checkInternetConnectivity()
  if (destroyed) return
  model.internetStatus = status
  if (model.internetStatus !== "online" && model.session.mode !== "solo" && model.screen === "start") model.modeIndex = 0
  refresh()
}

function maybeSubmitLobbyResult() {
  const lobbyUrl = env("OPENDUNGEON_LOBBY_URL", "DUNGEON_LOBBY_URL")
  if (!lobbyUrl || model.session.status === "running" || submittedSession === model.session) return
  submittedSession = model.session
  const result = {
    name: env("OPENDUNGEON_PLAYER_NAME", "DUNGEON_PLAYER_NAME") || model.session.hero.name,
    status: model.session.status,
    floor: model.session.floor,
    turns: model.session.turn,
    gold: model.session.gold,
    kills: model.session.kills,
    score: runScore(model.session),
  }

  void fetch(new URL("/finish", lobbyUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result),
  })
    .then((response) => {
      if (!response.ok) throw new Error(`Lobby returned ${response.status}`)
      model.session.log.unshift("Lobby result submitted.")
      refresh()
    })
    .catch(() => {
      model.session.log.unshift("Lobby result failed to submit.")
      refresh()
    })
}

function seedFromEnv() {
  const value = Number(env("OPENDUNGEON_SEED", "DUNGEON_SEED"))
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 2423368
}

function randomSeed() {
  return Math.floor(Math.random() * 9_000_000) + 1_000_000
}

function modeFromEnv(): MultiplayerMode {
  const value = env("OPENDUNGEON_MODE", "DUNGEON_MODE")
  return value === "coop" || value === "race" || value === "solo" ? value : "solo"
}

function classFromEnv(): HeroClass {
  const value = env("OPENDUNGEON_CLASS", "DUNGEON_CLASS")
  return isHeroClass(value) ? value : "ranger"
}

function modeIndexFromEnv() {
  const mode = modeFromEnv()
  if (mode === "coop") return 1
  if (mode === "race") return 2
  return 0
}

function classIndexFromEnv() {
  return classIndexFor(classFromEnv())
}

function runScore(session: GameSession) {
  return Math.max(0, session.floor * 100 + session.gold * 2 + session.kills * 25 + session.level * 50 - session.turn)
}

function autosaveSignature(session: GameSession) {
  return [
    session.seed,
    session.floor,
    session.turn,
    session.status,
    `${session.player.x},${session.player.y}`,
    session.hp,
    session.focus,
    session.gold,
    session.xp,
    session.level,
    session.kills,
    session.inventory.join("|"),
    session.combat.active ? session.combat.actorIds.join(",") : "",
    session.skillCheck?.id ?? "",
    session.skillCheck?.status ?? "",
  ].join("~")
}

function isSaveKey(key: KeyEvent) {
  return model.screen === "game" && ((key.ctrl && key.name === "s") || key.name === "f5")
}

function isConfirmKey(key: KeyEvent) {
  return key.name === "return" || key.name === "enter" || key.name === "linefeed" || key.name === "space"
}

function isUpKey(key: KeyEvent) {
  return key.name === "up" || (model.settings.controlScheme !== "arrows" && key.name === "w") || (model.settings.controlScheme === "vim" && key.name === "k")
}

function isDownKey(key: KeyEvent) {
  return key.name === "down" || (model.settings.controlScheme !== "arrows" && key.name === "s") || (model.settings.controlScheme === "vim" && key.name === "j")
}

function isLeftKey(key: KeyEvent) {
  return key.name === "left" || (model.settings.controlScheme !== "arrows" && key.name === "a") || (model.settings.controlScheme === "vim" && key.name === "h")
}

function isRightKey(key: KeyEvent) {
  return key.name === "right" || (model.settings.controlScheme !== "arrows" && key.name === "d") || (model.settings.controlScheme === "vim" && key.name === "l")
}

function movementForKey(key: KeyEvent, settings: UserSettings) {
  if (key.name === "up" || (settings.controlScheme !== "arrows" && key.name === "w") || (settings.controlScheme === "vim" && key.name === "k")) return { dx: 0, dy: -1 }
  if (key.name === "down" || (settings.controlScheme !== "arrows" && key.name === "s") || (settings.controlScheme === "vim" && key.name === "j")) return { dx: 0, dy: 1 }
  if (key.name === "left" || (settings.controlScheme !== "arrows" && key.name === "a") || (settings.controlScheme === "vim" && key.name === "h")) return { dx: -1, dy: 0 }
  if (key.name === "right" || (settings.controlScheme !== "arrows" && key.name === "d") || (settings.controlScheme === "vim" && key.name === "l")) return { dx: 1, dy: 0 }
  return null
}

function moveDirection(dx: number, dy: number): PlayerMoveAnimation["direction"] {
  if (dx < 0) return "left"
  if (dx > 0) return "right"
  if (dy < 0) return "up"
  return "down"
}

function indexForSave(saves: SaveSummary[], summary: SaveSummary) {
  const index = saves.findIndex((save) => save.id === summary.id)
  return index >= 0 ? index : 0
}

function classIndexFor(classId: HeroClass) {
  return Math.max(0, heroClassIds.indexOf(classId))
}

function modeIndexFor(mode: MultiplayerMode) {
  if (mode === "coop") return 1
  if (mode === "race") return 2
  return 0
}

function env(primary: string, fallback: string) {
  return process.env[primary] ?? process.env[fallback]
}

function cycleValue<const T extends string>(current: T, values: readonly T[]) {
  const index = values.indexOf(current)
  return values[(index + 1) % values.length]
}

function cleanProfileText(value: string) {
  return value.replace(/[^\w .-]/g, "").trim().slice(0, 24)
}

function cleanSaveInputText(value: string) {
  return value.replace(/[^\w .:/'()-]/g, "").trim().slice(0, 80)
}

function cleanCharacterName(value: string) {
  return value.replace(/[^\w .'-]/g, "").trim().slice(0, 24)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
