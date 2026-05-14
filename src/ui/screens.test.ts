import { describe, expect, test } from "bun:test"
import { applyOpeningStoryBranch, createSession, playLocalCutscene, selectSkill, tryMove, unlockHub } from "../game/session.js"
import { setTile } from "../game/dungeon.js"
import { defaultSettings } from "../game/settingsStore.js"
import { hashText } from "../shared/hash.js"
import { checkingUpdateStatus } from "../system/updateCheck.js"
import { currentStartItemDisabled, draw, type AppModel, type ScreenId } from "./screens.js"

type RenderCase = {
  name: string
  width: number
  height: number
  model: AppModel
  expectedHash: string
  requiredText: string[]
}

describe("terminal renderer snapshots", () => {
  const cases: RenderCase[] = [
    {
      name: "start",
      width: 80,
      height: 24,
      model: modelFor("start", createSession(1234)),
      expectedHash: "0dec2cde",
      requiredText: ["OPENDUNGEON", "New descent", "Settings", "v0.1.0"],
    },
    {
      name: "character",
      width: 100,
      height: 32,
      model: modelFor("character", createSession(1234, "solo", "ranger", "Nyx Prime")),
      expectedHash: "b7c5aec2",
      requiredText: ["Choose Your Crawler", "Name", "Nyx Prime", "Ranger"],
    },
    {
      name: "skill-check",
      width: 120,
      height: 40,
      model: skillCheckModel(),
      expectedHash: "285cc6a1",
      requiredText: ["Talent Check", "Whispering Relic", "Total >= difficulty", "Enter roll d20", "Esc step away"],
    },
    {
      name: "combat",
      width: 120,
      height: 40,
      model: combatModel(),
      expectedHash: "e6df33e5",
      requiredText: ["Turn Combat", "Order", "Shado", "Necroman", "Weakness"],
    },
    {
      name: "settings",
      width: 100,
      height: 32,
      model: modelFor("settings", createSession(4321), { settingsTabIndex: 3 }),
      expectedHash: "fcac0598",
      requiredText: ["Settings", "Visuals", "Camera FOV"],
    },
    {
      name: "tutorial",
      width: 100,
      height: 32,
      model: modelFor("tutorial", createSession(1234), { tutorialIndex: 1, menuIndex: 1 }),
      expectedHash: "ec3501a6",
      requiredText: ["Tutorial", "Combat", "Initiative", "d20"],
    },
    {
      name: "book",
      width: 100,
      height: 32,
      model: modelFor("game", createSession(1234), { dialog: "book" }),
      expectedHash: "caac3e41",
      requiredText: ["BOOK", "All entries", "Story", "Monsters", "Waking Cell", "Portal Room"],
    },
    {
      name: "village",
      width: 120,
      height: 40,
      model: villageModel(),
      expectedHash: "193d4514",
      requiredText: ["Village", "Walkable Village", "NPC Schedule", "Market and Balance", "Seed plan", "S seed", "G starts"],
    },
  ]

  for (const renderCase of cases) {
    test(`${renderCase.name} render stays within its golden terminal frame`, () => {
      withStableLocalPaths(() => {
        const output = draw(renderCase.model, renderCase.width, renderCase.height)
        const text = screenText(output.chunks)
        const rows = text.split("\n")

        expect(rows).toHaveLength(renderCase.height)
        expect(rows.every((row) => row.length === renderCase.width)).toBe(true)
        expect(text).not.toContain("undefined")
        expect(text).not.toContain("NaN")
        for (const required of renderCase.requiredText) expect(text).toContain(required)
        expect(hashText(styledSignature(output.chunks))).toBe(renderCase.expectedHash)
      })
    })
  }
})

test("title keeps local multiplayer available while offline", () => {
  expect(currentStartItemDisabled(modelFor("start", createSession(1234), { menuIndex: 4, internetStatus: "offline" }))).toBe(false)
  expect(currentStartItemDisabled(modelFor("start", createSession(1234), { menuIndex: 5, internetStatus: "checking" }))).toBe(true)
  expect(currentStartItemDisabled(modelFor("start", createSession(1234), { menuIndex: 1, internetStatus: "offline" }))).toBe(false)
})

test("multiplayer picker only shows multiplayer modes", () => {
  const output = draw(modelFor("mode", createSession(1234), { menuIndex: 0, modeIndex: 0 }), 100, 32)
  const text = screenText(output.chunks)

  expect(text).toContain("Multiplayer")
  expect(text).toContain("Multiplayer co-op")
  expect(text).toContain("Multiplayer race")
  expect(text).toContain("Single Player uses New descent")
  expect(text).toContain("Multiplayer with GM lives")
  expect(text).toContain("opendungeon join http://127.0.0.1:3737")
  expect(text).not.toContain("One crawl, local run.")
})

test("co-op game screen renders remote party members on the map and radar", () => {
  const session = createSession(1234, "coop", "ranger", "Mira")
  const output = draw(
    modelFor("game", session, {
      remotePlayers: [
        {
          id: "remote-sol",
          name: "Sol",
          classId: "cleric",
          floor: session.floor,
          x: session.player.x + 1,
          y: session.player.y,
          hp: 19,
          level: 1,
          connected: true,
          tutorialStage: "movement",
          tutorialReady: false,
          tutorialCompleted: false,
        },
      ],
    }),
    120,
    40,
  )
  const text = screenText(output.chunks)

  expect(text).toContain("Sol")
  expect(text).toContain("&ally")
})

test("normal screen changes do not draw transition banners", () => {
  const output = draw(
    modelFor("tutorial", createSession(1234), {
      screenTransition: {
        from: "start",
        to: "tutorial",
        label: "Opening tutorial.",
        kind: "screen",
        startedAt: Date.now(),
        durationMs: 420,
      },
    }),
    100,
    32,
  )
  const text = screenText(output.chunks)

  expect(text).toContain("Tutorial")
  expect(text).not.toContain("SHIFT")
  expect(text).not.toContain("Opening tutorial.")
})

test("title shows update command when a newer version is available", () => {
  const output = draw(
    modelFor("start", createSession(1234), {
      updateStatus: {
        state: "available",
        current: "0.1.0",
        latest: "0.2.0",
        command: "opendungeon update",
        npmCommand: "npm i -g @montekkundan/opendungeon@latest",
        bunCommand: "bun add -g @montekkundan/opendungeon@latest",
      },
    }),
    100,
    32,
  )
  const text = screenText(output.chunks)

  expect(text).toContain("v0.1.0")
  expect(text).toContain("Update 0.2.0 available. Run opendungeon update.")
})

test("title menu keeps only the clean padded item list", () => {
  const output = draw(modelFor("start", createSession(1234), { saves: [saveSummaryFixture()] }), 120, 40)
  const text = screenText(output.chunks)
  const selectedRow = text.split("\n").find((row) => row.includes("New descent")) ?? ""
  const selectedTextStart = selectedRow.indexOf("New descent")

  expect(text).toContain("terminal dungeon crawler")
  expect(text).toContain("New descent")
  expect(selectedTextStart).toBeGreaterThanOrEqual(54)
  expect(selectedTextStart).toBeLessThanOrEqual(56)
  expect(text).not.toContain("@local-crawler")
  expect(text).not.toContain("local saves")
  expect(text).not.toContain("internet online")
  expect(text).not.toContain("> New descent")
})

test("pause dialog keeps mode notes out of the action stack", () => {
  const output = draw(modelFor("game", createSession(1234, "race"), { dialog: "pause" }), 120, 40)
  const text = screenText(output.chunks)

  expect(text).toContain("PAUSED")
  expect(text).toContain("Resume")
  expect(text).toContain("Quit to title")
  expect(text).not.toContain("Close run")
  expect(text).not.toContain("Race mode keeps")
})

test("cloud profile screen draws account once and names local-only action clearly", () => {
  const output = draw(
    modelFor("cloud", createSession(1234), {
      menuIndex: 1,
      settings: { ...defaultSettings, username: "Mira", githubUsername: "montek", cloudProvider: "github" },
    }),
    120,
    40,
  )
  const text = screenText(output.chunks)

  expect(text).toContain("GitHub")
  expect(text).toContain("montek")
  expect(text).toContain("Keep saves local")
  expect(text).not.toContain("mmontek")
  expect(text).not.toContain("ggithub username")
  expect(text).not.toContain("Use local profile")
})

test("audio settings use portable shortcuts and keep panel copy bounded", () => {
  const output = draw(modelFor("settings", createSession(1234), { settingsTabIndex: 4, settingsIndex: 0 }), 136, 44)
  const text = screenText(output.chunks)
  const rows = text.split("\n")

  expect(rows).toHaveLength(44)
  expect(rows.every((row) => row.length === 136)).toBe(true)
  expect(text).toContain("Ctrl+O toggles all audio.")
  expect(text).toContain("Ctrl+O mute")
  expect(text).toContain("OpenTUI audio starts when enabled.")
  expect(text).not.toContain(["F", "8"].join(""))
  expect(text).not.toContain("function")
})

test("new descent story scene shows branch choices and cutscene controls", () => {
  const session = createSession(1234)
  playLocalCutscene(session, "waking-cell")
  const output = draw(modelFor("game", session, { dialog: "cutscene", cameraFocus: { x: session.player.x + 1, y: session.player.y } }), 100, 32)
  const text = screenText(output.chunks)

  expect(text).toContain("I have been here before")
  expect(text).toContain("Follow the voice")
  expect(text).toContain("Enter answer")
})

test("opening story outcome is visible in the run even when tutorial coach is open", () => {
  const session = createSession(1234, "solo", "ranger", "Mira", undefined, true)
  applyOpeningStoryBranch(session, "read-ledger")
  const output = draw(modelFor("game", session), 120, 40)
  const text = screenText(output.chunks)

  expect(text).toContain("Opening choice")
  expect(text).toContain("ledger page lists")
})

test("opening story branches change run state", () => {
  const session = createSession(1234)
  const beforeFocus = session.focus
  const beforeInventoryCount = session.inventory.length

  applyOpeningStoryBranch(session, "read-ledger")
  applyOpeningStoryBranch(session, "check-wound")

  expect(session.inventory.length).toBe(beforeInventoryCount + 1)
  expect(session.inventory[0]).toBe("Ledger scrap")
  expect(session.focus).toBeGreaterThanOrEqual(beforeFocus)
  expect(session.knowledge.map((entry) => entry.title)).toContain("Ledger Scrap")
  expect(session.toasts[0]?.text).toContain("The wound is old")
})

test("quest journal only lists discovered chains at the start", () => {
  const session = createSession(1234)
  const lockedTitle = session.world.quests.find((quest) => quest.status === "locked")?.title
  const output = draw(modelFor("game", session, { dialog: "quests" }), 120, 40)
  const text = screenText(output.chunks)

  expect(text).toContain("Escort: crypt")
  expect(text).toContain("locked quest chains hidden")
  const firstObjective = session.world.events.find((event) => event.id === session.world.quests.find((quest) => quest.status === "active")?.objectiveEventIds[0])?.title
  if (firstObjective) expect(text).toContain(firstObjective)
  if (lockedTitle) expect(text).not.toContain(lockedTitle)
})

test("inventory presents gold and full action labels", () => {
  const output = draw(modelFor("game", createSession(1234), { dialog: "inventory" }), 120, 40)
  const text = screenText(output.chunks)

  expect(text).toContain("Gold 0")
  expect(text).toContain("Enter use")
  expect(text).toContain("Esc close")
})

test("quickbar does not expose gold as a dead G action", () => {
  const output = draw(modelFor("game", createSession(1234)), 120, 40)
  const text = screenText(output.chunks)

  expect(text).toContain("0g")
  expect(text).not.toContain("G────────")
})

test("minimap renders a local radar with objective direction", () => {
  const output = draw(modelFor("game", createSession(1234)), 120, 40)
  const text = screenText(output.chunks)

  expect(text).toContain("Radar  goal E15")
  expect(text).toContain("Goal E15 (15 steps)")
  expect(text).toContain("@you &ally")
  expect(text).not.toContain("Mini map")
})

test("full map dialog shows dungeon overview and run counts", () => {
  const session = createSession(1234)
  session.kills = 2
  session.inventory.push("Moon shard")
  const output = draw(modelFor("game", session, { dialog: "map" }), 120, 40)
  const text = screenText(output.chunks)

  expect(text).toContain("DUNGEON MAP")
  expect(text).toContain("Full Map")
  expect(text).toContain("Run Stats")
  expect(text).toContain("Rooms")
  expect(text).toContain("Enemies")
  expect(text).toContain("Killed")
  expect(text).toContain("?? hidden")
  expect(text).toContain("Acquired")
  expect(text).toContain("@ you")
  expect(text).toContain("M or Esc close")
})

test("merchant response footer does not offer close-run from conversation", () => {
  const session = createSession(1234)
  session.conversation = {
    id: "merchant-test",
    actorId: "merchant-test",
    kind: "merchant",
    speaker: "Ash Merchant Pell",
    text: "12 gold needed for Merchant salve.",
    status: "completed",
    options: [],
    selectedOption: 0,
    trade: { item: "Merchant salve", price: 12, purchased: false },
  }
  const output = draw(modelFor("game", session), 120, 40)
  const text = screenText(output.chunks)

  expect(text).toContain("Enter close")
  expect(text).toContain("Esc leave")
  expect(text).not.toContain("Q close run")
})

test("active tutorial coach remains visible when run UI is hidden", () => {
  const session = createSession(1234, "solo", "ranger", "Mira", undefined, true)
  const output = draw(modelFor("game", session, { uiHidden: true }), 120, 40)
  const text = screenText(output.chunks)

  expect(text).toContain("Area I - Movement")
  expect(text).toContain("Up")
  expect(text).toContain("Pack I")
  expect(text).toContain("The gate opens")
})

test("tutorial coach wraps co-op checkpoint instructions", () => {
  const output = draw(modelFor("game", createSession(1234, "coop", "ranger", "Mira", undefined, true)), 136, 44)
  const text = screenText(output.chunks)

  expect(text).toContain("Area I - Movement")
  expect(text).toContain("In co-op")
  expect(text).toContain("every connected crawler")
  expect(text).toContain("must finish this checkpoint")
  expect(text).toContain("The gate opens")
})

test("talent check modal shows the full D20 rule and result copy", () => {
  const model = skillCheckModel()
  const check = model.session.skillCheck
  if (!check) throw new Error("expected skill check")
  check.status = "resolved"
  check.roll = { d20: 15, modifier: -1, total: 14, dc: check.dc, success: true, critical: false, fumble: false, stat: check.stat, consequence: check.successText }
  const output = draw(model, 120, 40)
  const text = screenText(output.chunks)

  expect(text).toContain("Total >= difficulty wins; 20 always succeeds and 1 fails.")
  expect(text).toContain("You got a Bound relic, focus, gold, and XP.")
  expect(text).toContain("Press I to inspect inventory.")
  expect(text).not.toContain("1 fa…")
})

test("book dialog separates monster entries into the monster tab", () => {
  const session = createSession(1234)
  const target = { x: session.player.x + 1, y: session.player.y }
  setTile(session.dungeon, target, "floor")
  session.dungeon.actors.push({ id: "book-slime", kind: "slime", position: target, hp: 12, damage: 0 })
  tryMove(session, 1, 0)

  const output = draw(modelFor("game", session, { dialog: "book", bookTabIndex: 3 }), 120, 40)
  const text = screenText(output.chunks)

  expect(text).toContain("Monsters")
  expect(text).toContain("Slime Monstrary")
  expect(text).toContain("Known weakness")
  expect(text).not.toContain("Waking Cell")
})

test("run end explains village recovery after death", () => {
  const session = createSession(1234)
  unlockHub(session)
  session.status = "dead"
  session.hp = 0
  const output = draw(modelFor("game", session), 120, 40)
  const text = screenText(output.chunks)

  expect(text).toContain("YOU FELL")
  expect(text).toContain("Village progress remains")
  expect(text).toContain("Enter next descent")
  expect(text).toContain("V village")
})

test("run end explains village preparation after victory", () => {
  const session = createSession(1234)
  unlockHub(session)
  session.status = "victory"
  const output = draw(modelFor("game", session), 120, 40)
  const text = screenText(output.chunks)

  expect(text).toContain("VICTORY")
  expect(text).toContain("sell loot, build, cook")
  expect(text).toContain("Enter next descent")
})

function skillCheckModel() {
  const session = createSession(1234)
  const target = { x: session.player.x + 1, y: session.player.y }
  setTile(session.dungeon, target, "relic")
  tryMove(session, 1, 0)
  return modelFor("game", session)
}

function combatModel() {
  const session = createSession(1234)
  const target = { x: session.player.x + 1, y: session.player.y }
  setTile(session.dungeon, target, "floor")
  session.dungeon.actors.push({
    id: "snapshot-necromancer",
    kind: "necromancer",
    position: target,
    hp: 80,
    damage: 5,
  })
  tryMove(session, 1, 0)
  selectSkill(session, 4)
  return modelFor("game", session)
}

function villageModel() {
  const session = createSession(1234, "coop", "ranger", "Nyx Prime")
  unlockHub(session)
  return modelFor("village", session)
}

function saveSummaryFixture() {
  return {
    id: "local",
    name: "Manual",
    savedAt: "2026-05-11T12:00:00.000Z",
    heroName: "Mira",
    heroTitle: "Ranger of Hollow Paths",
    classId: "ranger",
    mode: "solo",
    seed: 1234,
    floor: 1,
    finalFloor: 5,
    turn: 0,
    level: 1,
    gold: 0,
    status: "running",
    path: "/tmp/manual.json",
    slot: "manual" as const,
    thumbnail: [],
  }
}

function modelFor(screen: ScreenId, session = createSession(1234), overrides: Partial<AppModel> = {}): AppModel {
  return {
    screen,
    dialog: null,
    menuIndex: 1,
    classIndex: 2,
    modeIndex: 0,
    seed: session.seed,
    villageSeedMode: "fresh",
    session,
    message: "",
    saves: [],
    saveIndex: 0,
    saveStatus: "",
    debugView: false,
    rendererBackend: "terminal",
    settings: defaultSettings,
    settingsTabIndex: 0,
    settingsIndex: 0,
    settingsReturnScreen: "start",
    audioStatus: "Audio ready.",
    remotePlayers: [],
    coopGateStatus: "",
    inputMode: null,
    uiHidden: false,
    inventoryIndex: 0,
    inventoryDragIndex: null,
    bookIndex: 0,
    bookTabIndex: 0,
    questIndex: 0,
    tutorialIndex: 0,
    internetStatus: "online",
    currentVersion: "0.1.0",
    updateStatus: checkingUpdateStatus("0.1.0"),
    animationFrame: 0,
    playerMoveAnimation: null,
    diceRollAnimation: null,
    cameraFocus: null,
    screenTransition: null,
    cutsceneChoiceIndex: 0,
    ...overrides,
  }
}

function screenText(chunks: Array<{ text: string }>) {
  return chunks.map((chunk) => chunk.text).join("")
}

function withStableLocalPaths(assertions: () => void) {
  const previousProfileDir = process.env.OPENDUNGEON_PROFILE_DIR
  const previousSaveDir = process.env.OPENDUNGEON_SAVE_DIR
  process.env.OPENDUNGEON_PROFILE_DIR = "/tmp/opendungeon-test/profile"
  process.env.OPENDUNGEON_SAVE_DIR = "/tmp/opendungeon-test/saves"
  try {
    assertions()
  } finally {
    if (previousProfileDir === undefined) delete process.env.OPENDUNGEON_PROFILE_DIR
    else process.env.OPENDUNGEON_PROFILE_DIR = previousProfileDir
    if (previousSaveDir === undefined) delete process.env.OPENDUNGEON_SAVE_DIR
    else process.env.OPENDUNGEON_SAVE_DIR = previousSaveDir
  }
}

function styledSignature(chunks: Array<{ text: string; fg?: unknown; bg?: unknown; attributes?: number }>) {
  return chunks.map((chunk) => `${escapeText(chunk.text)}|${rgbaSignature(chunk.fg)}|${rgbaSignature(chunk.bg)}|${chunk.attributes ?? 0}`).join("\n")
}

function rgbaSignature(value: unknown) {
  const color = value as { r?: number; g?: number; b?: number; a?: number }
  if (typeof color?.r === "number" && typeof color.g === "number" && typeof color.b === "number") return `${color.r},${color.g},${color.b},${color.a ?? 255}`
  return "none"
}

function escapeText(text: string) {
  if (text === "\n") return "\\n"
  if (text === "|") return "\\|"
  return text
}
