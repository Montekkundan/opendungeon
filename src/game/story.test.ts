import { describe, expect, test } from "bun:test"
import { bossStoryLine, collectibleKnowledgeEntry, collectibleNoteEntry, floorKnowledgeEntry, initialKnowledgeEntries, localNpcStoryDialog, localStoryBeats, openingStoryText, skillCheckKnowledgeEntry, storyBeatForFloor, victoryStoryText } from "./story.js"
import type { Actor } from "./dungeon.js"
import type { NpcActorId } from "./domainTypes.js"

describe("local story script", () => {
  test("covers every floor through the final boss", () => {
    expect(localStoryBeats.map((beat) => beat.floor)).toEqual([1, 2, 3, 4, 5])
    expect(storyBeatForFloor(5).title).toContain("Root")
    expect(openingStoryText()).toContain("no memory")
    expect(victoryStoryText()).toContain("road home")
  })

  test("seeds the Book with memories, notes, and hub rumors", () => {
    expect(initialKnowledgeEntries().map((entry) => entry.kind)).toContain("memory")
    expect(initialKnowledgeEntries().map((entry) => entry.kind)).toContain("hub")
    expect(floorKnowledgeEntry(2).title).toBe("The Quiet Wards")
    expect(skillCheckKnowledgeEntry("relic", 3, true).text).toContain("portal room")
    expect(collectibleNoteEntry(1, "1-2-3").title).toContain("Recovered Note")
    expect(collectibleKnowledgeEntry("deed", 1, "1-2-3").kind).toBe("hub")
  })

  test("provides all NPC dialogue options for the local offline arc", () => {
    const npcKinds: NpcActorId[] = ["cartographer", "wound-surgeon", "shrine-keeper", "jailer", "merchant"]
    for (const kind of npcKinds) {
      for (const floor of [1, 2, 3, 4, 5]) {
        const dialog = localNpcStoryDialog(kind, floor)
        expect(dialog.speaker).toBeTruthy()
        expect(dialog.text).toContain(storyBeatForFloor(floor).title)
        expect(dialog.options).toHaveLength(3)
        expect(dialog.options.every((option) => option.id && option.label && option.text)).toBe(true)
      }
    }
  })

  test("adds final boss story lines for phase changes", () => {
    const boss: Actor = {
      id: "final-guardian",
      kind: "grave-root-boss",
      position: { x: 1, y: 1 },
      hp: 20,
      maxHp: 20,
      damage: 4,
      phase: 1,
    }

    expect(bossStoryLine(boss, 5)).toContain("failed descent")
    expect(bossStoryLine({ ...boss, phase: 2 }, 5, 2)).toContain("Root Throne")
  })
})
