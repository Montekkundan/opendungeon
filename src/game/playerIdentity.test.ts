import { describe, expect, test } from "bun:test"
import { cleanPlayerName, defaultPlayerName, playerNameFromEnv } from "./playerIdentity.js"

describe("player identity", () => {
  test("uses OPENDUNGEON_PLAYER_NAME as the process-local crawler name", () => {
    expect(playerNameFromEnv({ OPENDUNGEON_PLAYER_NAME: "Sol", DUNGEON_PLAYER_NAME: "Mira" })).toBe("Sol")
  })

  test("keeps the legacy player name env fallback", () => {
    expect(playerNameFromEnv({ DUNGEON_PLAYER_NAME: "Iri" })).toBe("Iri")
  })

  test("cleans names for terminal and lobby display", () => {
    expect(cleanPlayerName("  Sol<script> the 2nd  ")).toBe("Solscript the 2nd")
  })

  test("falls back to the default hero name when env is empty", () => {
    expect(defaultPlayerName({}, "Mira")).toBe("Mira")
  })
})
