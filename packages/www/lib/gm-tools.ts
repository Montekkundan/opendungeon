export const gmToolDefinitions = [
  {
    category: "lore",
    description:
      "Adds or edits a world-scoped lore beat without touching canonical story files.",
    name: "create_lore_patch",
    review:
      "Safe when the text stays in-world and belongs to the selected GM world.",
    status: "ready",
  },
  {
    category: "level",
    description:
      "Plans a dungeon floor, room pressure change, gate, encounter, or clue.",
    name: "create_dungeon_floor_patch",
    review: "Needs GM review because it can change pacing and route structure.",
    status: "needs-review",
  },
  {
    category: "entity",
    description: "Adds an NPC, monster, boss, loot source, or village visitor.",
    name: "spawn_npc_or_monster",
    review:
      "Needs GM review so new actors do not break the active party state.",
    status: "needs-review",
  },
  {
    category: "quest",
    description:
      "Adds a branch, consequence, reward, or failure beat to a quest.",
    name: "add_quest_branch",
    review: "Needs GM review because quest branches can affect progression.",
    status: "needs-review",
  },
  {
    category: "asset",
    description:
      "Creates a constrained prompt for terminal-safe pixel sprites.",
    name: "generate_sprite_prompt",
    review: "Needs GM review plus license and storage metadata before import.",
    status: "needs-review",
  },
  {
    category: "asset",
    description: "Approves an already generated asset for a GM-owned world.",
    name: "approve_asset_import",
    review: "Needs review so generated art never leaks into canonical assets.",
    status: "needs-review",
  },
  {
    category: "rules",
    description: "Changes bounded HP, damage, or encounter-pressure values.",
    name: "rebalance_encounter",
    review: "Safe only inside the documented numeric bounds.",
    status: "ready",
  },
  {
    category: "safety",
    description: "Shows the full patch before the host or players receive it.",
    name: "preview_patch",
    review: "Always required before apply.",
    status: "ready",
  },
  {
    category: "safety",
    description: "Queues a reviewed patch for host delivery.",
    name: "queue_player_patch",
    review: "Needs GM approval before connected players receive it.",
    status: "needs-review",
  },
  {
    category: "safety",
    description: "Applies an approved patch to the selected live host.",
    name: "apply_patch",
    review: "Needs GM approval and host acknowledgement.",
    status: "needs-review",
  },
  {
    category: "safety",
    description: "Restores the last known good GM world state.",
    name: "rollback_patch",
    review: "Needs explicit GM confirmation.",
    status: "needs-review",
  },
] as const;

export const gmSpriteGenerationRules = [
  "Target tiny terminal-safe pixel art with a readable silhouette.",
  "Use a limited palette and avoid gradients that smear in terminal cells.",
  "Use a transparent background where the sprite needs to sit on dungeon tiles.",
  "Do not request copyrighted likenesses, logos, or text baked into the image.",
  "Include frame size, runtime folder, source/license, and GM world ownership metadata.",
] as const;

export type GmToolName = (typeof gmToolDefinitions)[number]["name"];
export type GmToolStatus = (typeof gmToolDefinitions)[number]["status"];

export interface ValidatedGmToolCallPreview {
  category: string;
  description: string;
  name: GmToolName;
  review: string;
  status: GmToolStatus;
  summary: string;
}

export interface GmOperationLike {
  path: string;
}

const toolByName = new Map(gmToolDefinitions.map((tool) => [tool.name, tool]));

export function fallbackGmToolCalls(
  operations: readonly GmOperationLike[]
): ValidatedGmToolCallPreview[] {
  const names = new Set<GmToolName>(["preview_patch"]);
  if (operations.some((operation) => operation.path.startsWith("lore."))) {
    names.add("create_lore_patch");
  }
  if (operations.some((operation) => operation.path.startsWith("floors."))) {
    names.add("create_dungeon_floor_patch");
  }
  if (operations.some((operation) => operation.path.startsWith("rules."))) {
    names.add("rebalance_encounter");
  }
  names.add("queue_player_patch");
  return [...names].map((name) =>
    buildToolCallPreview(name, defaultToolSummary(name))
  );
}

export function normalizeGmToolCallPreview(
  input: unknown
): ValidatedGmToolCallPreview[] {
  if (!input || typeof input !== "object") {
    return [];
  }
  const record = input as Record<string, unknown>;
  const name = cleanToolName(record.name);
  if (!name) {
    return [];
  }
  return [
    buildToolCallPreview(
      name,
      cleanLine(record.summary, 140) ?? defaultToolSummary(name),
      record.status === "ready" ? "ready" : undefined
    ),
  ];
}

export function gmToolPromptCatalog() {
  return gmToolDefinitions
    .map(
      (tool) =>
        `- ${tool.name} (${tool.status}, ${tool.category}): ${tool.description}`
    )
    .join("\n");
}

function buildToolCallPreview(
  name: GmToolName,
  summary: string,
  requestedStatus?: GmToolStatus
): ValidatedGmToolCallPreview {
  const definition = toolByName.get(name);
  if (!definition) {
    throw new Error(`Unknown GM tool: ${name}`);
  }
  const status =
    definition.status === "needs-review"
      ? "needs-review"
      : (requestedStatus ?? definition.status);
  return {
    category: definition.category,
    description: definition.description,
    name,
    review: definition.review,
    status,
    summary,
  };
}

function cleanToolName(value: unknown): GmToolName | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/[^\w-]/g, "").trim();
  return toolByName.has(normalized as GmToolName)
    ? (normalized as GmToolName)
    : null;
}

function cleanLine(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value
    .replace(/[^\w .,:;!?'"()/-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return cleaned || null;
}

function defaultToolSummary(name: GmToolName) {
  const definition = toolByName.get(name);
  return definition?.description ?? "Validated GM tool call.";
}
