import { describe, expect, test } from "bun:test"
import { createSession, selectSkill, tryMove, unlockHub } from "../game/session.js"
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
      expectedHash: "1e0eb95b",
      requiredText: ["OPENDUNGEON", "New descent", "Settings", "v0.1.0"],
    },
    {
      name: "character",
      width: 100,
      height: 32,
      model: modelFor("character", createSession(1234, "solo", "ranger", "Nyx Prime")),
      expectedHash: "47b2a6f5",
      requiredText: ["Choose Your Crawler", "Name", "Nyx Prime", "Ranger"],
    },
    {
      name: "skill-check",
      width: 120,
      height: 40,
      model: skillCheckModel(),
      expectedHash: "e3c0ab52",
      requiredText: ["Talent Check", "Whispering Relic", "Roll"],
    },
    {
      name: "combat",
      width: 120,
      height: 40,
      model: combatModel(),
      expectedHash: "3239e2eb",
      requiredText: ["Turn Combat", "Order", "Shado", "Necroman"],
    },
    {
      name: "settings",
      width: 100,
      height: 32,
      model: modelFor("settings", createSession(4321), { settingsTabIndex: 3 }),
      expectedHash: "d7e3d2b0",
      requiredText: ["Settings", "Visuals", "Camera FOV"],
    },
    {
      name: "tutorial",
      width: 100,
      height: 32,
      model: modelFor("tutorial", createSession(1234), { tutorialIndex: 1, menuIndex: 1 }),
      expectedHash: "11cff4fc",
      requiredText: ["Tutorial", "Combat", "Initiative", "d20"],
    },
    {
      name: "book",
      width: 100,
      height: 32,
      model: modelFor("game", createSession(1234), { dialog: "book" }),
      expectedHash: "6fb11055",
      requiredText: ["BOOK", "Known", "Waking Cell", "Portal Room"],
    },
    {
      name: "village",
      width: 120,
      height: 40,
      model: villageModel(),
      expectedHash: "d6b0d4e7",
      requiredText: ["Village", "Walkable Village", "NPC Schedule", "Market and Balance"],
    },
  ]

  for (const renderCase of cases) {
    test(`${renderCase.name} render stays within its golden terminal frame`, () => {
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
  }
})

test("title disables internet-only entries while offline", () => {
  expect(currentStartItemDisabled(modelFor("start", createSession(1234), { menuIndex: 4, internetStatus: "offline" }))).toBe(true)
  expect(currentStartItemDisabled(modelFor("start", createSession(1234), { menuIndex: 5, internetStatus: "checking" }))).toBe(true)
  expect(currentStartItemDisabled(modelFor("start", createSession(1234), { menuIndex: 1, internetStatus: "offline" }))).toBe(false)
})

test("multiplayer picker only shows multiplayer modes", () => {
  const output = draw(modelFor("mode", createSession(1234), { menuIndex: 0, modeIndex: 0 }), 100, 32)
  const text = screenText(output.chunks)

  expect(text).toContain("Multiplayer")
  expect(text).toContain("Co-op")
  expect(text).toContain("Race")
  expect(text).toContain("Solo runs start from New descent")
  expect(text).not.toContain("One crawl, local run.")
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

function modelFor(screen: ScreenId, session = createSession(1234), overrides: Partial<AppModel> = {}): AppModel {
  return {
    screen,
    dialog: null,
    menuIndex: 1,
    classIndex: 2,
    modeIndex: 0,
    seed: session.seed,
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
    inputMode: null,
    uiHidden: false,
    inventoryIndex: 0,
    inventoryDragIndex: null,
    bookIndex: 0,
    questIndex: 0,
    tutorialIndex: 0,
    internetStatus: "online",
    currentVersion: "0.1.0",
    updateStatus: checkingUpdateStatus("0.1.0"),
    animationFrame: 0,
    playerMoveAnimation: null,
    diceRollAnimation: null,
    screenTransition: null,
    ...overrides,
  }
}

function screenText(chunks: Array<{ text: string }>) {
  return chunks.map((chunk) => chunk.text).join("")
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
