import { describe, expect, test } from "bun:test";
import {
  fallbackGmToolCalls,
  gmSpriteGenerationRules,
  gmToolDefinitions,
  normalizeGmToolCallPreview,
} from "./gm-tools";

describe("GM tool validation", () => {
  test("derives safe default tools from bounded operations", () => {
    const tools = fallbackGmToolCalls([
      { path: "rules.enemyHpMultiplier" },
      { path: "floors.2.encounterBudget" },
      { path: "lore.gmBriefing" },
    ]);

    expect(tools.map((tool) => tool.name)).toEqual([
      "preview_patch",
      "create_lore_patch",
      "create_dungeon_floor_patch",
      "rebalance_encounter",
      "queue_player_patch",
    ]);
    expect(
      tools.find((tool) => tool.name === "queue_player_patch")
    ).toMatchObject({ status: "needs-review" });
  });

  test("rejects arbitrary AI tool names and preserves review status", () => {
    expect(
      normalizeGmToolCallPreview({
        name: "run_shell_command",
        summary: "do not allow this",
      })
    ).toEqual([]);

    expect(
      normalizeGmToolCallPreview({
        name: "generate_sprite_prompt",
        status: "ready",
        summary: "Create a tiny door warden sprite prompt.",
      })
    ).toEqual([
      expect.objectContaining({
        name: "generate_sprite_prompt",
        status: "needs-review",
      }),
    ]);
  });

  test("documents sprite prompt safety rules for GM-created assets", () => {
    expect(gmToolDefinitions.map((tool) => tool.name)).toContain(
      "approve_asset_import"
    );
    expect(gmSpriteGenerationRules.join(" ")).toContain(
      "transparent background"
    );
    expect(gmSpriteGenerationRules.join(" ")).toContain("copyrighted");
  });
});
