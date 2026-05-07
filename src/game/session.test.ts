import { describe, expect, test } from "bun:test"
import { createSession, tryMove, usePotion } from "./session.js"
import { setTile } from "./dungeon.js"
import { draw } from "../ui/screens.js"

describe("game session", () => {
  test("creates a seeded dungeon with a reachable player start", () => {
    const session = createSession(1234, "solo", "ranger")

    expect(session.dungeon.width).toBeGreaterThan(40)
    expect(session.dungeon.height).toBeGreaterThan(20)
    expect(session.dungeon.tiles[session.player.y][session.player.x]).toBe("floor")
  })

  test("collects loot into inventory", () => {
    const session = createSession(1234)
    const target = { x: session.player.x + 1, y: session.player.y }
    setTile(session.dungeon, target, "potion")

    tryMove(session, 1, 0)

    expect(session.inventory[0]).toBe("Deploy nerve potion")
    expect(session.dungeon.tiles[target.y][target.x]).toBe("floor")
  })

  test("uses potion to heal", () => {
    const session = createSession(1234)
    session.inventory.unshift("Deploy nerve potion")
    session.hp = 2

    usePotion(session)

    expect(session.hp).toBe(7)
    expect(session.inventory).not.toContain("Deploy nerve potion")
  })

  test("renders start and game screens to a full terminal-sized surface", () => {
    const session = createSession()
    const start = draw(
      {
        screen: "start",
        dialog: null,
        menuIndex: 0,
        classIndex: 2,
        modeIndex: 0,
        seed: 2423368,
        session,
        message: "",
        debugView: false,
        rendererBackend: "terminal",
      },
      80,
      24,
    ).chunks

    expect(start.map((chunk) => chunk.text).join("")).toContain("DUNGEON DEV CRAWL")
  })
})
