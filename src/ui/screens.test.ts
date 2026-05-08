import { describe, expect, test } from "bun:test"
import { createSession, selectSkill, tryMove } from "../game/session.js"
import { setTile } from "../game/dungeon.js"
import { defaultSettings } from "../game/settingsStore.js"
import { draw, type AppModel, type ScreenId } from "./screens.js"

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
      expectedHash: "0e5daf94",
      requiredText: ["OPENDUNGEON", "New descent", "Settings"],
    },
    {
      name: "character",
      width: 100,
      height: 32,
      model: modelFor("character", createSession(1234, "solo", "ranger", "Nyx Prime")),
      expectedHash: "0f53359d",
      requiredText: ["Choose Your Crawler", "Name", "Nyx Prime", "Ranger"],
    },
    {
      name: "skill-check",
      width: 120,
      height: 40,
      model: skillCheckModel(),
      expectedHash: "c1d075e2",
      requiredText: ["Talent Check", "Whispering Relic", "Roll"],
    },
    {
      name: "combat",
      width: 120,
      height: 40,
      model: combatModel(),
      expectedHash: "e5c4f390",
      requiredText: ["Turn Combat", "Shado", "Necroman"],
    },
    {
      name: "settings",
      width: 100,
      height: 32,
      model: modelFor("settings", createSession(4321), { settingsTabIndex: 3 }),
      expectedHash: "3720a229",
      requiredText: ["Settings", "Visuals", "Camera FOV"],
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
      expect(stableHash(styledSignature(output.chunks))).toBe(renderCase.expectedHash)
    })
  }
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
    questIndex: 0,
    diceRollAnimation: null,
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

function stableHash(text: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}
