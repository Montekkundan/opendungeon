import { FrameBufferRenderable, createCliRenderer, type KeyEvent, type MouseEvent as OpenTuiMouseEvent } from "@opentui/core"
import WebSocket from "ws"
import {
  addToast,
  applyOpeningStoryBranch,
  createNextDescentSession,
  createSession,
  cycleTarget,
  chooseConversationOption,
  chooseLevelUpTalent,
  cycleConversationOption,
  attemptFlee,
  buildHubStation,
  cancelSkillCheck,
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
  recordTutorialAction,
  rest,
  resolveSkillCheck,
  runVillageShopSale,
  selectSkill,
  sellLootToVillage,
  setTutorialCoopGateHold,
  tutorialCoopCheckpoint,
  toggleRunMutator,
  tryMove,
  upgradeWeapon,
  visitVillageLocation,
  usePotion,
  type GameSession,
  type HeroClass,
  type MultiplayerMode,
  type RunToast,
} from "./game/session.js"
import { openingStoryBranches } from "./game/story.js"
import { deleteSave, exportSave, listSaves, loadSave, renameSave, saveAutosave, saveSession, type SaveSummary } from "./game/saveStore.js"
import { handleSaveCommand, saveCommandHelp } from "./game/saveCli.js"
import { loadSettings, saveSettings, type UserSettings } from "./game/settingsStore.js"
import { defaultPlayerName, playerNameFromEnv } from "./game/playerIdentity.js"
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
  bookEntriesForTab,
  bookTabCount,
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
  type RemotePlayerMarker,
  type ScreenId,
  type ScreenTransition,
} from "./ui/screens.js"
import { shouldUseThreeRenderer } from "./rendering/threeAssets.js"
import { authHelpText, handleAuthCommand } from "./cloud/authCli.js"
import { loadAuthSession } from "./cloud/authStore.js"
import { formatTerminalCapabilityReport, terminalCapabilityReport } from "./system/terminalDoctor.js"
import { formatServerSetupReport, serverSetupReport } from "./system/serverSetupCheck.js"
import { handleSetupCommand } from "./system/firstRunSetup.js"
import { acquireLocalRunLock, releaseLocalRunLock, type LocalRunLock } from "./system/localRunLock.js"
import { debugOverlaysEnabled } from "./system/debugFlags.js"
import { checkInternetConnectivity } from "./net/connectivity.js"
import { normalizeLobbyBaseUrl } from "./net/hostConfig.js"
import type { CoopSyncState, LobbySnapshot } from "./net/lobbyState.js"
import { checkForUpdate, checkingUpdateStatus, handleUpdateCommand } from "./system/updateCheck.js"
import { easeInOutQuart, lerp } from "./shared/numeric.js"
import { transitionDurationForKind } from "./ui/teleportAnimation.js"
import { GameAudioController } from "./audio/gameAudio.js"
import type { AudioEventId } from "./audio/audioManifest.js"

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`opendungeon ${version}

Terminal roguelike RPG built with OpenTUI.

Usage:
  opendungeon                   Start the game
  opendungeon join <lobby-url>  Join a hosted lobby URL
  opendungeon login <username>  Prompt for a password and save an auth session
  opendungeon --login github    Open Supabase GitHub OAuth
  opendungeon saves list        List local saves for backup or maintenance
  opendungeon assets generate   Generate and store a sprite asset
  opendungeon update            Check npm for a newer game version
  opendungeon setup             Create local first-run directories/profile
  opendungeon doctor            Check terminal size/color and recommended tile scale
  opendungeon setup-check       Check Supabase, AI Gateway, and asset storage env
  opendungeon --help            Show this help
  opendungeon --version         Show the version

Environment:
  OPENDUNGEON_SAVE_DIR     Override local save directory
  OPENDUNGEON_PROFILE_DIR  Override local profile/settings directory
  OPENDUNGEON_RUN_LOCK_DIR Override signed-in active-run lock directory
  OPENDUNGEON_TERMINAL_APP Override the terminal app label used in duplicate-run messages
  OPENDUNGEON_PLAYER_NAME  Override the local crawler name for one process
  OPENDUNGEON_ASSET_DIR    Override bundled asset directory
  OPENDUNGEON_TILE_SCALE   overview | wide | medium | close
  OPENDUNGEON_DEBUG_OVERLAY=1 enables debug map/console overlays
  OPENDUNGEON_LOBBY_URL    Hosted lobby URL for co-op/race result sync

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
const updateExitCode = await handleUpdateCommand(process.argv.slice(2), version)
if (updateExitCode !== null) process.exit(updateExitCode)
const setupExitCode = await handleSetupCommand(process.argv.slice(2))
if (setupExitCode !== null) process.exit(setupExitCode)
const cliJoin = await resolveJoinCommand(process.argv.slice(2))

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
const initialPlayerName = defaultPlayerName()

const model: AppModel = {
  screen: "start",
  dialog: null,
  menuIndex: initialSaves.length ? 0 : 1,
  classIndex: classIndexFromEnv(),
  modeIndex: modeIndexFromEnv(),
  seed: seedFromEnv(),
  session: createSession(seedFromEnv(), modeFromEnv(), classFromEnv(), initialPlayerName),
  message: "",
  saves: initialSaves,
  saveIndex: 0,
  saveStatus: cliJoin?.status ?? "",
  debugView: debugOverlaysEnabled(),
  rendererBackend: shouldUseThreeRenderer() ? "three" : "terminal",
  settings: initialSettings,
  settingsTabIndex: 0,
  settingsIndex: 0,
  settingsReturnScreen: "start",
  audioStatus: "Audio ready.",
  remotePlayers: [],
  coopGateStatus: "",
  inputMode: null,
  uiHidden: !initialSettings.showUi,
  inventoryIndex: 0,
  inventoryDragIndex: null,
  bookIndex: 0,
  bookTabIndex: 0,
  questIndex: 0,
  tutorialIndex: 0,
  internetStatus: "checking",
  currentVersion: version,
  updateStatus: checkingUpdateStatus(version),
  animationFrame: 0,
  playerMoveAnimation: null,
  diceRollAnimation: null,
  cameraFocus: null,
  screenTransition: null,
  cutsceneChoiceIndex: 0,
}
let submittedSession: GameSession | null = null
let diceTimer: ReturnType<typeof setTimeout> | null = null
let moveTimer: ReturnType<typeof setTimeout> | null = null
let cameraTimer: ReturnType<typeof setTimeout> | null = null
let transitionTimer: ReturnType<typeof setTimeout> | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null
let autosaveTimer: ReturnType<typeof setInterval> | null = null
let destroyed = false
let cameraReturnAnimation: {
  from: { x: number; y: number }
  to: { x: number; y: number }
  startedAt: number
  durationMs: number
} | null = null
let pendingDeleteSaveId: string | null = null
let lastAutosaveSignature = ""
let lastManualSaveSignature = ""
let lobbySocket: WebSocket | null = null
let lobbySocketUrl = ""
let lobbyConnectedPlayers = 0
let activeRunLock: LocalRunLock | null = null
const localGuestSessionId = crypto.randomUUID().slice(0, 8)
const localLobbyClientId = crypto.randomUUID()
const toastCreatedAt = new Map<string, number>()
const sfxToastIds = new Set<string>()
const toastTtlMs = 3200
const audioController = new GameAudioController()
let lastAudioSyncKey = ""

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
void refreshUpdateStatus()
autosaveTimer = setInterval(() => autosaveCurrentRun("timer"), 30_000)
if (cliJoin?.autoStart) startRun()
refresh()

renderer.keyInput.on("keypress", (key: KeyEvent) => {
  if (key.ctrl && key.name === "c") {
    destroyApp()
    return
  }

  if (isMuteKey(key)) {
    toggleAudioMute()
    refresh()
    return
  }

  if (key.name === "escape") playAudioEvent("menu-cancel")

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
    syncLobbyState()
    refresh()
    return
  }

  if (model.dialog) {
    handleDialogKey(key)
    if (model.screen === "game") {
      autosaveCurrentRun()
      syncLobbyState()
    }
    refresh()
    return
  }

  if (key.name === "q" && model.screen === "game" && model.session.conversation && !model.session.combat.active && !model.session.skillCheck) {
    model.session.conversation = null
    model.saveStatus = "Conversation closed."
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
    syncLobbyState()
    maybeSubmitLobbyResult()
    refresh()
    return
  }

  if (model.screen === "game") {
    handleGameKey(key)
    autosaveCurrentRun()
    syncLobbyState()
  } else handleMenuKey(key)

  maybeSubmitLobbyResult()
  refresh()
})

function handleDialogKey(key: KeyEvent) {
  if (model.dialog === "quit") {
    if (key.name === "s") {
      if (saveCurrentRun(true)) closeRunToTitle("Saved run and returned to title.")
      return
    }
    if (key.name === "q") {
      closeRunToTitle("Run closed. Autosave remains available.")
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

  if (model.dialog === "map") {
    if (key.name === "m") model.dialog = null
    else if (key.name === "escape" || isConfirmKey(key)) model.dialog = null
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
    closeRunToTitle("Returning to title.")
    return
  }
  if (model.dialog === "pause" && key.name === "m") {
    refreshSaveList()
    model.dialog = "saveManager"
    return
  }
  if (model.dialog === "cutscene") {
    const openingBranches = model.session.hub.lastCutsceneId === "waking-cell" ? openingStoryBranches(model.session.hero.name) : []
    if (openingBranches.length) {
      if (/^[1-3]$/.test(key.name)) {
        model.cutsceneChoiceIndex = clamp(Number(key.name) - 1, 0, openingBranches.length - 1)
        return
      }
      if (isLeftKey(key) || isUpKey(key)) {
        model.cutsceneChoiceIndex = (((model.cutsceneChoiceIndex ?? 0) - 1) % openingBranches.length + openingBranches.length) % openingBranches.length
        return
      }
      if (isRightKey(key) || isDownKey(key)) {
        model.cutsceneChoiceIndex = ((model.cutsceneChoiceIndex ?? 0) + 1) % openingBranches.length
        return
      }
      if (isConfirmKey(key)) {
        const branch = openingBranches[clamp(model.cutsceneChoiceIndex ?? 0, 0, openingBranches.length - 1)]
        if (branch) applyOpeningStoryBranch(model.session, branch.id)
        model.saveStatus = ""
        model.dialog = null
        clearCameraReturnAnimation()
        return
      }
    }
    if (key.name === "escape") {
      model.dialog = null
      clearCameraReturnAnimation()
      return
    }
    if (isConfirmKey(key)) {
      model.dialog = null
      clearCameraReturnAnimation()
      return
    }
  }
  if (key.name === "escape" || key.name === "return" || key.name === "enter" || key.name === "linefeed") {
    model.dialog = null
  }
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
  const max = Math.max(0, visibleQuestCount(model.session) - 1)
  if (key.name === "escape" || isConfirmKey(key)) {
    model.dialog = null
    return
  }
  if (isUpKey(key)) model.questIndex = clamp(model.questIndex - 1, 0, max)
  if (isDownKey(key)) model.questIndex = clamp(model.questIndex + 1, 0, max)
  if (key.name === "pageup") model.questIndex = clamp(model.questIndex - 5, 0, max)
  if (key.name === "pagedown") model.questIndex = clamp(model.questIndex + 5, 0, max)
}

function visibleQuestCount(session: GameSession) {
  const unlocked = session.world.quests.filter((quest) => quest.status !== "locked").length
  return unlocked || Math.min(session.world.quests.length, 1)
}

function handleBookKey(key: KeyEvent) {
  if (key.name === "escape" || isConfirmKey(key)) {
    model.dialog = null
    return
  }
  if (isLeftKey(key) || key.name === "[") {
    model.bookTabIndex = (model.bookTabIndex + bookTabCount() - 1) % bookTabCount()
    model.bookIndex = 0
    return
  }
  if (isRightKey(key) || key.name === "]" || key.name === "tab") {
    model.bookTabIndex = (model.bookTabIndex + 1) % bookTabCount()
    model.bookIndex = 0
    return
  }
  const max = Math.max(0, bookEntriesForTab(model.session, model.bookTabIndex).length - 1)
  if (isUpKey(key)) model.bookIndex = clamp(model.bookIndex - 1, 0, max)
  if (isDownKey(key)) model.bookIndex = clamp(model.bookIndex + 1, 0, max)
  if (key.name === "pageup") model.bookIndex = clamp(model.bookIndex - 5, 0, max)
  if (key.name === "pagedown") model.bookIndex = clamp(model.bookIndex + 5, 0, max)
}

function clampBookSelection() {
  model.bookTabIndex = clamp(model.bookTabIndex, 0, Math.max(0, bookTabCount() - 1))
  model.bookIndex = clamp(model.bookIndex, 0, Math.max(0, bookEntriesForTab(model.session, model.bookTabIndex).length - 1))
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
    model.cameraFocus = null
    model.dialog = "cutscene"
    return
  }
  if (key.name === "1") {
    buildHubStation(model.session, "blacksmith")
    playAudioEvent("village-build")
  }
  if (key.name === "2") {
    buildHubStation(model.session, "kitchen")
    playAudioEvent("village-build")
  }
  if (key.name === "3") {
    sellLootToVillage(model.session)
    playAudioEvent("item-pickup")
  }
  if (key.name === "4") {
    prepareFood(model.session)
    playAudioEvent("village-build")
  }
  if (key.name === "5") {
    if (!plantCrop(model.session)) harvestFarm(model.session)
    playAudioEvent("village-build")
  }
  if (key.name === "6") {
    upgradeWeapon(model.session)
    playAudioEvent("village-build")
  }
  if (key.name === "7") {
    completeVillageQuest(model.session)
    playAudioEvent("quest-update")
  }
  if (key.name === "8") toggleRunMutator(model.session, "hard-mode")
  if (key.name === "9") toggleRunMutator(model.session, "cursed-floors")
  model.saveStatus = model.session.log[0] ?? "Hub updated."
}

function handleVillageKey(key: KeyEvent) {
  if (key.name === "g") {
    model.seed = randomSeed()
    startVillageDescent()
    return
  }
  if (key.name === "1") {
    buildHubStation(model.session, "blacksmith")
    playAudioEvent("village-build")
    model.saveStatus = model.session.log[0] ?? "Blacksmith checked."
    return
  }
  if (key.name === "3") {
    const coins = sellLootToVillage(model.session)
    playAudioEvent(coins > 0 ? "item-pickup" : "menu-cancel")
    model.saveStatus = coins > 0 ? `Sold loot for ${coins} coins.` : model.session.log[0] ?? "No loot to sell."
    return
  }
  if (key.name === "4") {
    prepareFood(model.session)
    playAudioEvent("village-build")
    model.saveStatus = model.session.log[0] ?? "Food prepared."
    return
  }
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
    playAudioEvent(sale ? "item-pickup" : "menu-cancel")
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
    if (key.name === "escape") {
      cancelSkillCheck(model.session)
      return
    }
    if (isConfirmKey(key)) {
      playAudioEvent("d20-roll")
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
      if (model.session.hub.unlocked) openVillageRoad("Village road opens.")
      else blockVillageShortcut()
      return
    }
    if (isConfirmKey(key)) {
      if (model.session.hub.unlocked) startVillageDescent()
      else startRun()
      return
    }
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
    if (key.name === "escape") {
      model.session.conversation = null
      model.saveStatus = "Conversation closed."
      return
    }
    if (isConfirmKey(key)) {
      if (model.session.conversation.status === "completed") {
        model.session.conversation = null
        model.saveStatus = "Conversation closed."
      } else {
        interactWithWorld(model.session)
      }
      return
    }
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
    recordTutorialAction(model.session, "inventory")
    return
  }
  if (key.name === "l") {
    model.dialog = "log"
    return
  }
  if (key.name === "m") {
    model.dialog = "map"
    return
  }
  if (key.name === "b") {
    model.dialog = "book"
    clampBookSelection()
    recordTutorialAction(model.session, "book")
    return
  }
  if (key.name === "v") {
    if (model.session.hub.unlocked) {
      openVillageRoad("Village road opens.")
      return
    }
    blockVillageShortcut()
    return
  }
  if (key.name === "o" || (key.name === "j" && model.settings.controlScheme !== "vim")) {
    model.dialog = "quests"
    model.questIndex = clamp(model.questIndex, 0, Math.max(0, visibleQuestCount(model.session) - 1))
    recordTutorialAction(model.session, "quests")
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
    const wasHubUnlocked = model.session.hub.unlocked
    tryMove(model.session, move.dx, move.dy)
    if (before.x !== model.session.player.x || before.y !== model.session.player.y) startPlayerMoveAnimation(moveDirection(move.dx, move.dy))
    if ((model.session.status as GameSession["status"]) === "victory" && model.session.hub.unlocked && !wasHubUnlocked) openVillageRoad("The final gate opens to the village.", Boolean(model.session.hub.lastCutsceneId))
  }
}

function openVillageRoad(label: string, showCutscene = false) {
  model.dialog = showCutscene ? "cutscene" : null
  setScreen("village", label, "village")
  model.saveStatus = label
}

function blockVillageShortcut() {
  const text = "Village road is locked. Clear the dungeon or recover a village deed before using V."
  addToast(model.session, "Village locked", text, "warning")
  model.saveStatus = text
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
    playAudioEvent("d20-roll")
    const roll = attemptFlee(model.session)
    if (roll) startDiceRollAnimation(roll.d20)
    return
  }
  if (isConfirmKey(key)) {
    const previousRoll = model.session.combat.lastRoll
    playAudioEvent("d20-roll")
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
      playAudioEvent("menu-cancel")
      model.saveStatus = model.internetStatus === "checking" ? "Checking internet before enabling cloud login." : "Offline: cloud login and AI admin sync are disabled."
      void refreshInternetStatus()
      return
    }
    playAudioEvent("menu-confirm")
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

  playAudioEvent("menu-confirm")
  if (model.screen === "character") {
    model.classIndex = model.menuIndex
    model.session.hero.appearance = normalizeHeroAppearance(currentClass(model).id, model.session.hero.appearance)
    setScreen("start", "Crawler selected.")
    model.menuIndex = 0
    return
  }

  if (model.screen === "mode") {
    model.modeIndex = modeIndexFor(multiplayerModeForSelection(model.menuIndex).id)
    startRun()
    return
  }
}

function startRun() {
  if (!acquireRunSlot()) return
  model.session = createSession(
    model.seed,
    currentMode(model).id,
    currentClass(model).id,
    currentPlayerName(),
    model.session.hero.appearance,
    model.settings.startWithTutorial,
    !model.settings.startWithTutorial,
  )
  submittedSession = null
  clearCameraReturnAnimation(false)
  setScreen("game", "The descent opens.", "portal")
  playLocalCutscene(model.session, "waking-cell")
  model.dialog = "cutscene"
  model.cameraFocus = introCameraPoint(model.session)
  model.uiHidden = !model.settings.showUi
  model.bookIndex = 0
  model.bookTabIndex = 0
  model.cutsceneChoiceIndex = 0
  model.saveStatus = `${currentMode(model).name} run started. Press Ctrl+S to save locally.`
  lastManualSaveSignature = ""
  connectLobby()
  autosaveCurrentRun("new-run")
}

function startVillageDescent() {
  if (!acquireRunSlot()) return
  model.session = createNextDescentSession(model.session, model.seed)
  model.classIndex = classIndexFor(model.session.hero.classId)
  model.modeIndex = modeIndexFor(model.session.mode)
  submittedSession = null
  clearCameraReturnAnimation(false)
  setScreen("game", "Next descent opens.", "portal")
  model.dialog = null
  model.cameraFocus = null
  model.uiHidden = !model.settings.showUi
  model.bookIndex = 0
  model.bookTabIndex = 0
  model.cutsceneChoiceIndex = 0
  model.saveStatus = "Village progress carried into the next descent. Press Ctrl+S to save locally."
  lastManualSaveSignature = ""
  connectLobby()
  autosaveCurrentRun("village-descent")
}

function introCameraPoint(session: GameSession) {
  const quest = session.world.quests.find((candidate) => candidate.status === "active")
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

  const alreadyLocked = Boolean(activeRunLock)
  if (!acquireRunSlot()) return

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
    if (!alreadyLocked) releaseRunSlot()
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
    model.saveStatus = "No local saves yet. Start a descent and press Ctrl+S."
    model.menuIndex = 1
    return
  }

  model.saveIndex = 0
  loadSelectedSave()
}

function saveCurrentRun(skipFollowupAutosave = false) {
  if (model.screen !== "game") return false
  try {
    const summary = saveSession(model.session)
    model.saves = listSaves()
    model.saveIndex = indexForSave(model.saves, summary)
    model.saveStatus = `Saved locally: ${summary.name}.`
    model.session.log.unshift(`Saved locally: ${summary.name}.`)
    while (model.session.log.length > 8) model.session.log.pop()
    lastManualSaveSignature = autosaveSignature(model.session)
    if (!skipFollowupAutosave) autosaveCurrentRun("manual-save")
    return true
  } catch (error) {
    model.saveStatus = error instanceof Error ? error.message : "Manual save failed."
    return false
  }
}

function autosaveCurrentRun(_reason = "change") {
  if (model.screen !== "game") return
  const signature = autosaveSignature(model.session)
  if (signature === lastAutosaveSignature) return
  try {
    const summary = saveAutosave(model.session, currentAutosaveId())
    lastAutosaveSignature = signature
    model.saves = listSaves()
    model.saveIndex = indexForSave(model.saves, summary)
  } catch (error) {
    model.saveStatus = error instanceof Error ? error.message : "Autosave failed."
  }
}

function currentAutosaveId() {
  if (activeRunLock || model.session.mode === "solo") return undefined
  return `autosave-${localGuestSessionId}`
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
    saveUserSettings("Using local saves only. Cloud sync remains off.")
    setScreen("start", "Using local saves only.")
    model.menuIndex = 1
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
  if (item.id === "startWithTutorial") model.settings.startWithTutorial = !model.settings.startWithTutorial
  if (item.id === "diceSkin") model.settings.diceSkin = cycleValue(model.settings.diceSkin, diceSkinIds)
  if (item.id === "backgroundFx") model.settings.backgroundFx = cycleValue(model.settings.backgroundFx, ["low", "normal", "dense"])
  if (item.id === "tileScale") model.settings.tileScale = cycleValue(model.settings.tileScale, mapScaleOptions)
  if (item.id === "muteAudio") model.settings.muteAudio = !model.settings.muteAudio
  if (item.id === "masterVolume") model.settings.masterVolume = cycleVolume(model.settings.masterVolume)
  if (item.id === "music") model.settings.music = !model.settings.music
  if (item.id === "musicVolume") model.settings.musicVolume = cycleVolume(model.settings.musicVolume)
  if (item.id === "sound") model.settings.sound = !model.settings.sound
  if (item.id === "sfxVolume") model.settings.sfxVolume = cycleVolume(model.settings.sfxVolume)
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
  syncAudio()
}

function toggleRunUi() {
  model.uiHidden = !model.uiHidden
  model.session.log.unshift(model.uiHidden ? "UI hidden for this run. Press U to show it." : "UI shown for this run. Press U to hide it.")
  while (model.session.log.length > 8) model.session.log.pop()
}

const mapScaleOptions: UserSettings["tileScale"][] = ["overview", "wide", "medium", "close"]
const volumeSteps = [0, 0.25, 0.5, 0.75, 1] as const

function cycleVolume(value: number) {
  let current = 0
  for (let index = 1; index < volumeSteps.length; index++) {
    if (Math.abs(volumeSteps[index] - value) < Math.abs(volumeSteps[current] - value)) current = index
  }
  return volumeSteps[(current + 1) % volumeSteps.length] ?? 0.75
}

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
  if (kind !== "screen") playTransitionAudio(kind)
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
    durationMs: transitionDurationForKind(kind),
  }
  queueScreenTransitionFrame()
}

function startCameraReturnAnimation() {
  const from = model.cameraFocus
  clearCameraReturnAnimation(false)
  if (!from || model.session.status !== "running") {
    model.cameraFocus = null
    return
  }

  const to = { ...model.session.player }
  if (from.x === to.x && from.y === to.y) {
    model.cameraFocus = null
    return
  }

  if (model.settings.reduceMotion) {
    model.cameraFocus = null
    return
  }

  const distance = Math.abs(from.x - to.x) + Math.abs(from.y - to.y)
  cameraReturnAnimation = {
    from: { ...from },
    to,
    startedAt: Date.now(),
    durationMs: Math.min(2200, Math.max(1100, 900 + distance * 48)),
  }
  applyCameraReturnFrame()
}

function clearCameraReturnAnimation(clearFocus = true) {
  if (cameraTimer) clearTimeout(cameraTimer)
  cameraTimer = null
  cameraReturnAnimation = null
  if (clearFocus) model.cameraFocus = null
}

function applyCameraReturnFrame() {
  const animation = cameraReturnAnimation
  if (!animation || destroyed) return

  const progress = Math.min(1, Math.max(0, (Date.now() - animation.startedAt) / animation.durationMs))
  const eased = easeInOutQuart(progress)
  model.cameraFocus = {
    x: Math.round(lerp(animation.from.x, animation.to.x, eased)),
    y: Math.round(lerp(animation.from.y, animation.to.y, eased)),
  }

  if (progress >= 1) {
    clearCameraReturnAnimation()
    refresh()
    return
  }

  refresh()
  queueCameraReturnFrame()
}

function queueCameraReturnFrame() {
  if (cameraTimer || destroyed) return
  cameraTimer = setTimeout(() => {
    cameraTimer = null
    applyCameraReturnFrame()
  }, 33)
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
  syncAudio()
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

function syncAudio() {
  const key = [
    model.screen,
    model.dialog ?? "none",
    model.settings.muteAudio,
    model.settings.music,
    model.settings.sound,
    model.settings.masterVolume,
    model.settings.musicVolume,
    model.settings.sfxVolume,
  ].join(":")
  if (key === lastAudioSyncKey) return
  lastAudioSyncKey = key
  void audioController.sync({ screen: model.screen, dialog: model.dialog }, model.settings).then((status) => {
    if (destroyed || model.audioStatus === status) return
    model.audioStatus = status
    if (model.screen === "settings" || model.screen === "controls") refresh()
  })
}

function playAudioEvent(eventId: AudioEventId) {
  void audioController.playEvent(eventId, model.settings)
}

function playTransitionAudio(kind: ScreenTransition["kind"]) {
  if (kind !== "portal") return
  playAudioEvent("teleport-start")
  setTimeout(() => {
    if (!destroyed) playAudioEvent("teleport-end")
  }, Math.max(120, transitionDurationForKind(kind) - 80))
}

function syncToastLifetimes() {
  const now = Date.now()
  for (const toast of model.session.toasts) {
    if (!toastCreatedAt.has(toast.id)) {
      toastCreatedAt.set(toast.id, now)
      playToastAudio(toast)
    }
  }
  model.session.toasts = model.session.toasts.filter((toast, index) => {
    const created = toastCreatedAt.get(toast.id) ?? now
    return now - created < toastTtlMs + index * 450
  })
  const activeIds = new Set(model.session.toasts.map((toast) => toast.id))
  for (const id of toastCreatedAt.keys()) {
    if (!activeIds.has(id)) toastCreatedAt.delete(id)
  }
  for (const id of sfxToastIds) {
    if (!activeIds.has(id)) sfxToastIds.delete(id)
  }
}

function playToastAudio(toast: RunToast) {
  if (sfxToastIds.has(toast.id)) return
  const eventId = audioEventForToast(toast)
  if (!eventId) return
  sfxToastIds.add(toast.id)
  playAudioEvent(eventId)
}

function audioEventForToast(toast: RunToast): AudioEventId | null {
  const title = toast.title.toLowerCase()
  const text = toast.text.toLowerCase()
  if (title.includes("critical")) return "combat-crit"
  if (title.includes("attack hit")) return "combat-hit"
  if (title.includes("attack missed") || title.includes("flee failed") || text.includes("miss")) return "combat-block"
  if (title.includes("talent check succeeded")) return "d20-success"
  if (title.includes("talent check failed") || title.includes("run ended")) return "d20-fail"
  if (title.includes("door opened") || title.includes("gate")) return "gate-open"
  if (title.includes("book updated") || title.includes("weakness found")) return "book-update"
  if (title.includes("quest") || title.includes("find the final gate") || title.includes("dungeon cleared") || title.includes("level ")) return "quest-update"
  if (title.includes("item used") || title.includes("potion used") || title.includes("trade complete") || title.endsWith(" found")) return "item-pickup"
  if (title.includes("village") || title.includes("blacksmith") || title.includes("food")) return "village-build"
  return toast.tone === "success" ? "d20-success" : toast.tone === "danger" ? "d20-fail" : null
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
  if ((model.screen === "game" || model.screen === "village") && model.session.status === "running" && hasUnsavedManualChanges()) {
    model.dialog = "quit"
    model.saveStatus = lastAutosaveSignature === autosaveSignature(model.session) ? "Autosave is current; manual save is older." : "This run has not been saved yet."
    refresh()
    return
  }
  if (model.screen === "game" || model.screen === "village") {
    closeRunToTitle("Run closed. Terminal remains open.")
    return
  }
  destroyApp()
}

function hasUnsavedManualChanges() {
  return lastManualSaveSignature !== autosaveSignature(model.session)
}

function destroyApp() {
  destroyed = true
  closeLobbySocket()
  releaseRunSlot()
  audioController.dispose()
  if (diceTimer) clearTimeout(diceTimer)
  diceTimer = null
  if (moveTimer) clearTimeout(moveTimer)
  moveTimer = null
  if (cameraTimer) clearTimeout(cameraTimer)
  cameraTimer = null
  cameraReturnAnimation = null
  if (transitionTimer) clearTimeout(transitionTimer)
  transitionTimer = null
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = null
  if (autosaveTimer) clearInterval(autosaveTimer)
  autosaveTimer = null
  renderer.destroy()
}

function closeRunToTitle(status: string) {
  closeLobbySocket()
  releaseRunSlot()
  model.dialog = null
  model.diceRollAnimation = null
  model.playerMoveAnimation = null
  clearCameraReturnAnimation()
  model.screenTransition = null
  setScreen("start", status)
  model.menuIndex = model.saves.length ? 0 : 1
  model.saveStatus = status
}

function acquireRunSlot() {
  if (activeRunLock) return true
  const result = acquireLocalRunLock({ session: loadAuthSession() })
  if (!result.allowed) {
    model.saveStatus = result.message
    model.message = result.message
    return false
  }
  activeRunLock = result.lock
  return true
}

function releaseRunSlot() {
  releaseLocalRunLock(activeRunLock)
  activeRunLock = null
}

async function refreshInternetStatus() {
  const status = await checkInternetConnectivity()
  if (destroyed) return
  model.internetStatus = status
  refresh()
}

async function refreshUpdateStatus() {
  const status = await checkForUpdate(version)
  if (destroyed) return
  model.updateStatus = status
  refresh()
}

function connectLobby() {
  const lobbyUrl = lobbyUrlFromConfig()
  if (!lobbyUrl || lobbySocketUrl === lobbyUrl) return
  closeLobbySocket()
  lobbySocketUrl = lobbyUrl

  try {
    const socketUrl = new URL("/ws", lobbyUrl)
    socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:"
    socketUrl.searchParams.set("name", currentPlayerName())
    socketUrl.searchParams.set("role", "player")
    socketUrl.searchParams.set("clientId", localLobbyClientId)
    const socket = new WebSocket(socketUrl)
    lobbySocket = socket
    socket.on("open", () => {
      model.session.log.unshift(`Connected to lobby ${lobbyUrl}.`)
      syncLobbyState()
      refresh()
    })
    socket.on("message", (message) => updateLobbyStatus(message.toString()))
    socket.on("close", () => {
      if (lobbySocket === socket) lobbySocket = null
      lobbyConnectedPlayers = 0
      model.remotePlayers = []
      model.coopGateStatus = ""
      clearCoopTutorialHold()
    })
    socket.on("error", () => {
      model.session.log.unshift("Lobby connection failed.")
      refresh()
    })
  } catch {
    model.session.log.unshift("Lobby URL is invalid.")
  }
}

function syncLobbyState() {
  if (!lobbySocket || lobbySocket.readyState !== WebSocket.OPEN) return
  const checkpoint = tutorialCoopCheckpoint(model.session)
  lobbySocket.send(
    JSON.stringify({
      type: "sync",
      state: {
        classId: model.session.hero.classId,
        floor: model.session.floor,
        turn: model.session.turn,
        hp: model.session.hp,
        level: model.session.level,
        unspentStatPoints: model.session.levelUp ? 1 : 0,
        inventoryCount: model.session.inventory.length,
        gold: model.session.gold,
        saveRevision: model.session.turn,
        x: model.session.player.x,
        y: model.session.player.y,
        combatActive: model.session.combat.active,
        tutorialStage: checkpoint.stage,
        tutorialReady: checkpoint.ready,
        tutorialCompleted: checkpoint.completed,
      },
    }),
  )
}

function updateLobbyStatus(text: string) {
  try {
    const snapshot = JSON.parse(text) as Partial<LobbySnapshot>
    const players = Array.isArray(snapshot.players) ? snapshot.players.length : 0
    if (players && players !== lobbyConnectedPlayers) {
      lobbyConnectedPlayers = players
      model.session.log.unshift(`Lobby players online: ${players}.`)
    }
    model.remotePlayers = remotePlayersFromSnapshot(snapshot)
    applyCoopTutorialGateHolds()
    const warning = Array.isArray(snapshot.syncWarnings) ? snapshot.syncWarnings[0] : ""
    if (warning && model.session.log[0] !== warning) {
      model.session.log.unshift(warning)
    }
    refresh()
  } catch {
    return
  }
}

function remotePlayersFromSnapshot(snapshot: Partial<LobbySnapshot>): RemotePlayerMarker[] {
  if (!Array.isArray(snapshot.coopStates)) return []
  return snapshot.coopStates.flatMap((state) => {
    const sync = state as Partial<CoopSyncState>
    if (!sync.playerId || sync.playerId === localLobbyClientId) return []
    const name = String(sync.name || "Crawler").trim()
    return [
      {
        id: sync.playerId,
        name: name || "Crawler",
        classId: isHeroClass(sync.classId) ? sync.classId : "ranger",
        floor: Math.max(1, Math.floor(Number(sync.floor) || 1)),
        x: Math.floor(Number(sync.x) || 0),
        y: Math.floor(Number(sync.y) || 0),
        hp: Math.max(0, Math.floor(Number(sync.hp) || 0)),
        level: Math.max(1, Math.floor(Number(sync.level) || 1)),
        connected: sync.connected !== false,
        tutorialStage: cleanRemoteTutorialStage(sync.tutorialStage),
        tutorialReady: Boolean(sync.tutorialReady),
        tutorialCompleted: Boolean(sync.tutorialCompleted),
      },
    ]
  })
}

function applyCoopTutorialGateHolds() {
  if (model.session.mode !== "coop") {
    clearCoopTutorialHold()
    return
  }
  const checkpoint = tutorialCoopCheckpoint(model.session)
  if (checkpoint.completed || checkpoint.stage === "complete" || lobbyConnectedPlayers <= 1) {
    clearCoopTutorialHold()
    return
  }

  const waiting: string[] = []
  const expectedRemoteCount = Math.max(0, lobbyConnectedPlayers - 1)
  const connectedRemotes = model.remotePlayers.filter((player) => player.connected)
  if (connectedRemotes.length < expectedRemoteCount) waiting.push("party sync")

  for (const remote of connectedRemotes) {
    if (!remoteReadyForTutorialStage(remote, checkpoint.stage)) waiting.push(remote.name)
  }

  setTutorialCoopGateHold(model.session, checkpoint.stage, waiting)
  model.coopGateStatus = waiting.length ? `Waiting for ${waiting.join(", ")} before ${tutorialGateLabel(checkpoint.stage)}.` : ""
}

function clearCoopTutorialHold() {
  setTutorialCoopGateHold(model.session, null, [])
}

function remoteReadyForTutorialStage(remote: RemotePlayerMarker, stage: Exclude<ReturnType<typeof tutorialCoopCheckpoint>["stage"], "complete">) {
  if (remote.tutorialCompleted) return true
  const remoteStage = cleanRemoteTutorialStage(remote.tutorialStage)
  if (tutorialStageRank(remoteStage) > tutorialStageRank(stage)) return true
  return remoteStage === stage && remote.tutorialReady
}

function cleanRemoteTutorialStage(value: unknown) {
  return value === "movement" || value === "npc-check" || value === "combat" || value === "complete" ? value : "complete"
}

function tutorialStageRank(stage: string) {
  if (stage === "movement") return 0
  if (stage === "npc-check") return 1
  if (stage === "combat") return 2
  return 3
}

function tutorialGateLabel(stage: string) {
  if (stage === "movement") return "Area II opens"
  if (stage === "npc-check") return "Area III opens"
  return "the tutorial completes"
}

function closeLobbySocket() {
  if (lobbySocket) lobbySocket.close()
  lobbySocket = null
  lobbySocketUrl = ""
  lobbyConnectedPlayers = 0
  model.remotePlayers = []
  model.coopGateStatus = ""
  clearCoopTutorialHold()
}

function maybeSubmitLobbyResult() {
  const lobbyUrl = lobbyUrlFromConfig()
  if (!lobbyUrl || model.session.status === "running" || submittedSession === model.session) return
  submittedSession = model.session
  const result = {
    name: currentPlayerName(),
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

function lobbyUrlFromConfig() {
  return cliJoin?.lobbyUrl || normalizeLobbyBaseUrl(env("OPENDUNGEON_LOBBY_URL", "DUNGEON_LOBBY_URL") || "")
}

function currentPlayerName() {
  return playerNameFromEnv() || model.session.hero.name
}

function seedFromEnv() {
  if (cliJoin?.seed) return cliJoin.seed
  const value = Number(env("OPENDUNGEON_SEED", "DUNGEON_SEED"))
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 2423368
}

function randomSeed() {
  return Math.floor(Math.random() * 9_000_000) + 1_000_000
}

function modeFromEnv(): MultiplayerMode {
  if (cliJoin?.mode) return cliJoin.mode
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
  return model.screen === "game" && key.ctrl && key.name === "s"
}

function isMuteKey(key: KeyEvent) {
  return key.ctrl && key.name === "o"
}

function toggleAudioMute() {
  model.settings.muteAudio = !model.settings.muteAudio
  saveUserSettings(model.settings.muteAudio ? "Audio muted. Press Ctrl+O to unmute." : "Audio unmuted.")
  if (model.screen === "game") addToast(model.session, "audio-mute", model.settings.muteAudio ? "Audio muted" : "Audio unmuted")
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

type CliJoin = {
  lobbyUrl: string
  seed?: number
  mode?: MultiplayerMode
  status: string
  autoStart: boolean
}

async function resolveJoinCommand(args: string[]): Promise<CliJoin | null> {
  if (args[0] !== "join") return null
  const lobbyUrl = normalizeLobbyBaseUrl(args[1] || "")
  if (!lobbyUrl) {
    console.error("Usage: opendungeon join <lobby-url>")
    process.exit(1)
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3500)
    const response = await fetch(new URL("/invite", lobbyUrl), { signal: controller.signal }).finally(() => clearTimeout(timer))
    if (!response.ok) throw new Error(`Lobby returned ${response.status}`)
    const invite = (await response.json()) as { mode?: string; seed?: number; url?: string }
    const mode = invite.mode === "coop" || invite.mode === "race" ? invite.mode : undefined
    const seed = Number.isFinite(Number(invite.seed)) ? Math.floor(Number(invite.seed)) : undefined
    const url = normalizeLobbyBaseUrl(invite.url || lobbyUrl) || lobbyUrl
    return {
      lobbyUrl: url,
      seed,
      mode,
      status: `Joining lobby ${url}.`,
      autoStart: Boolean(seed && mode),
    }
  } catch {
    return {
      lobbyUrl,
      status: `Could not read lobby invite at ${lobbyUrl}. Check the server URL and port.`,
      autoStart: false,
    }
  }
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
