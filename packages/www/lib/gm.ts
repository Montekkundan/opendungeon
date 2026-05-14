export const gmDifficultyLevels = [
  "easier",
  "steady",
  "harder",
  "deadly",
] as const;

const AI_JSON_FENCE_START_RE = /^```(?:json)?/u;
const AI_JSON_FENCE_END_RE = /```$/u;
const GM_FLOOR_ENCOUNTER_PATH_RE = /^floors\.\d+\.encounterBudget$/u;
const TRAILING_SLASH_RE = /\/$/;

export type GmDifficultyLevel = (typeof gmDifficultyLevels)[number];

export interface GmPatchOperation {
  path: string;
  reason: string;
  value: string | number | boolean;
}

export interface GmToolCallPreview {
  name: string;
  status: "ready" | "needs-review";
  summary: string;
}

export interface GmPatchDraft {
  aiNote?: string;
  approvalChecklist: string[];
  difficulty: GmDifficultyLevel;
  id: string;
  model?: string;
  operations: GmPatchOperation[];
  playerBriefing: string;
  source?: "ai-gateway" | "rules-fallback";
  title: string;
  toolCalls: GmToolCallPreview[];
}

export interface GmHostPlayer {
  id: string;
  joinedAt?: number;
  name: string;
}

export interface GmHostCoopState {
  classId: string;
  combatActive: boolean;
  connected: boolean;
  floor: number;
  gold: number;
  hp: number;
  inventoryCount: number;
  level: number;
  name: string;
  playerId: string;
  saveRevision: number;
  turn: number;
  tutorialCompleted: boolean;
  tutorialReady: boolean;
  tutorialStage: string;
  updatedAt: number;
  x: number;
  y: number;
}

export interface GmHostDeliveredPatch {
  approvedAt: number;
  briefing: string;
  difficulty: GmDifficultyLevel;
  id: string;
  operationCount: number;
  operations: GmPatchOperation[];
  title: string;
}

export interface GmHostActionEntry {
  createdAt: number;
  floor: number;
  hp: number;
  id: string;
  label: string;
  name: string;
  playerId: string;
  turn: number;
  type: "move" | "interact" | "combat" | "inventory" | "village" | "system";
  x: number;
  y: number;
}

export interface GmHostSnapshot {
  actions: GmHostActionEntry[];
  combat: {
    active: boolean;
    activePlayerId?: string;
    order: string[];
    round: number;
  };
  coopStates: GmHostCoopState[];
  gmPatches: GmHostDeliveredPatch[];
  inviteCode: string;
  mode: "coop" | "race";
  players: GmHostPlayer[];
  seed: number;
  spectators: GmHostPlayer[];
  syncWarnings: string[];
}

export interface GmHostBridgeResult {
  error: string | null;
  snapshot: GmHostSnapshot | null;
  url: string;
}

export function normalizeDifficulty(
  value: FormDataEntryValue | null
): GmDifficultyLevel {
  return gmDifficultyLevels.includes(value as GmDifficultyLevel)
    ? (value as GmDifficultyLevel)
    : "steady";
}

export function buildGmPatchDraft(input: {
  difficulty: GmDifficultyLevel;
  floor: number;
  partySize: number;
  prompt: string;
  worldId: string;
}): GmPatchDraft {
  const prompt = cleanPrompt(input.prompt);
  const scale = difficultyScale(input.difficulty);
  const floor = clampNumber(input.floor, 1, 9);
  const partySize = clampNumber(input.partySize, 1, 6);
  const id = `gm-${input.difficulty}-${slug(`${input.worldId}-${prompt}`)}`;

  return {
    approvalChecklist: [
      "Patch only changes the selected GM world.",
      "No generated code or unvalidated script is allowed.",
      "Players receive the patch only after GM approval.",
      "Canonical Single Player lore and assets stay unchanged.",
    ],
    difficulty: input.difficulty,
    id,
    operations: [
      {
        path: "rules.enemyHpMultiplier",
        reason: "Scale enemy staying power for the requested table pressure.",
        value: scale.hpMultiplier,
      },
      {
        path: "rules.enemyDamageBonus",
        reason: "Tune punishment without changing deterministic combat math.",
        value: scale.damageBonus,
      },
      {
        path: `floors.${floor}.encounterBudget`,
        reason:
          "Adjust the active floor instead of rewriting the whole dungeon.",
        value: scale.encounterBudget + partySize,
      },
      {
        path: "lore.gmBriefing",
        reason: "Give players an in-world reason for the changed pressure.",
        value: prompt,
      },
    ],
    playerBriefing: briefingFor(input.difficulty, prompt),
    source: "rules-fallback",
    title: `${labelForDifficulty(input.difficulty)} on Floor ${floor}`,
    toolCalls: [
      {
        name: "create_lore_patch",
        status: "ready",
        summary: "Adds a short GM-authored lore beat to the selected world.",
      },
      {
        name: "rebalance_encounter",
        status: "ready",
        summary: "Updates HP, damage, and encounter budget within safe bounds.",
      },
      {
        name: "queue_player_patch",
        status: "needs-review",
        summary: "Waits for GM approval before connected players receive it.",
      },
    ],
  };
}

export async function buildGmPatchDraftWithAi(input: {
  difficulty: GmDifficultyLevel;
  floor: number;
  partySize: number;
  prompt: string;
  worldId: string;
}): Promise<GmPatchDraft> {
  const fallback = buildGmPatchDraft(input);
  if (!gmAiGatewayConfigured()) {
    return {
      ...fallback,
      aiNote:
        "AI Gateway is not configured, so this draft used the local validated rules fallback.",
    };
  }

  const model = process.env.OPENDUNGEON_GM_MODEL || "openai/gpt-5.4";
  try {
    const { generateText } = await import("ai");
    const { text } = await generateText({
      model,
      prompt: gmPatchPrompt(input, fallback),
      providerOptions: {
        gateway: {
          tags: ["opendungeon", "gm", "patch-draft"],
        },
      },
      temperature: 0.25,
    });
    const parsed = parseJsonObject(text);
    return normalizeAiDraft(parsed, fallback, model);
  } catch (error) {
    return {
      ...fallback,
      aiNote:
        error instanceof Error
          ? `AI Gateway draft failed, so this used the local fallback: ${error.message}`
          : "AI Gateway draft failed, so this used the local fallback.",
    };
  }
}

export function gmAiGatewayConfigured(
  env: Record<string, string | undefined> = process.env
) {
  return Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN);
}

function gmPatchPrompt(
  input: {
    difficulty: GmDifficultyLevel;
    floor: number;
    partySize: number;
    prompt: string;
    worldId: string;
  },
  fallback: GmPatchDraft
) {
  return `You are the opendungeon GM assistant. Return JSON only.

World id: ${input.worldId}
Requested difficulty: ${input.difficulty}
Floor: ${input.floor}
Party size: ${input.partySize}
GM prompt: ${cleanPrompt(input.prompt)}

Rules:
- Preserve the canonical single-player story. This patch applies only to the selected GM world.
- Do not output code, SQL, shell commands, or arbitrary scripts.
- Use only these operation paths:
  - rules.enemyHpMultiplier, number 0.5 to 2
  - rules.enemyDamageBonus, integer -3 to 3
  - floors.${clampNumber(input.floor, 1, 9)}.encounterBudget, integer 0 to 12
  - lore.gmBriefing, short in-world text
- Keep the briefing useful to players and readable in a terminal.

Fallback operations if unsure:
${JSON.stringify(fallback.operations)}

JSON shape:
{
  "title": "short title",
  "playerBriefing": "one or two sentence player-facing briefing",
  "operations": [{"path": "rules.enemyHpMultiplier", "value": 1.25, "reason": "short reason"}],
  "toolCalls": [{"name": "create_lore_patch", "status": "ready", "summary": "short summary"}],
  "approvalChecklist": ["short checklist item"]
}`;
}

function parseJsonObject(text: string) {
  const raw = text
    .trim()
    .replace(AI_JSON_FENCE_START_RE, "")
    .replace(AI_JSON_FENCE_END_RE, "")
    .trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("AI response did not contain a JSON object.");
  }
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

function normalizeAiDraft(
  input: Record<string, unknown>,
  fallback: GmPatchDraft,
  model: string
): GmPatchDraft {
  const operations = Array.isArray(input.operations)
    ? input.operations.flatMap((operation) =>
        normalizeAiOperation(operation, fallback)
      )
    : [];
  const toolCalls = Array.isArray(input.toolCalls)
    ? input.toolCalls.flatMap(normalizeAiToolCall)
    : [];
  const approvalChecklist = Array.isArray(input.approvalChecklist)
    ? input.approvalChecklist.flatMap((item) => cleanShortLine(item, 120))
    : [];

  return {
    ...fallback,
    approvalChecklist: approvalChecklist.length
      ? approvalChecklist.slice(0, 6)
      : fallback.approvalChecklist,
    model,
    operations: operations.length
      ? operations.slice(0, 6)
      : fallback.operations,
    playerBriefing:
      cleanShortLine(input.playerBriefing, 260)[0] ?? fallback.playerBriefing,
    source: "ai-gateway",
    title: cleanShortLine(input.title, 80)[0] ?? fallback.title,
    toolCalls: toolCalls.length ? toolCalls.slice(0, 6) : fallback.toolCalls,
  };
}

function normalizeAiOperation(
  input: unknown,
  fallback: GmPatchDraft
): GmPatchOperation[] {
  if (!input || typeof input !== "object") {
    return [];
  }
  const record = input as Record<string, unknown>;
  const path = String(record.path || "");
  const floorPath = fallback.operations.find((operation) =>
    GM_FLOOR_ENCOUNTER_PATH_RE.test(operation.path)
  )?.path;
  if (path === "rules.enemyHpMultiplier") {
    return [
      {
        path,
        reason:
          cleanShortLine(record.reason, 140)[0] ?? "Scale enemy staying power.",
        value: clampNumber(Number(record.value), 0.5, 2),
      },
    ];
  }
  if (path === "rules.enemyDamageBonus") {
    return [
      {
        path,
        reason:
          cleanShortLine(record.reason, 140)[0] ??
          "Adjust enemy damage pressure.",
        value: clampNumber(Number(record.value), -3, 3),
      },
    ];
  }
  if (path === floorPath) {
    return [
      {
        path,
        reason:
          cleanShortLine(record.reason, 140)[0] ??
          "Adjust active-floor encounter budget.",
        value: clampNumber(Number(record.value), 0, 12),
      },
    ];
  }
  if (path === "lore.gmBriefing") {
    return [
      {
        path,
        reason:
          cleanShortLine(record.reason, 140)[0] ??
          "Explain the GM change in-world.",
        value: cleanShortLine(record.value, 180)[0] ?? fallback.playerBriefing,
      },
    ];
  }
  return [];
}

function normalizeAiToolCall(input: unknown): GmToolCallPreview[] {
  if (!input || typeof input !== "object") {
    return [];
  }
  const record = input as Record<string, unknown>;
  const name = cleanToolName(record.name);
  if (!name) {
    return [];
  }
  const status = record.status === "needs-review" ? "needs-review" : "ready";
  return [
    {
      name,
      status,
      summary:
        cleanShortLine(record.summary, 140)[0] ?? "Validated GM tool call.",
    },
  ];
}

function cleanToolName(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/[^\w-]/g, "")
    .trim()
    .slice(0, 48);
}

function cleanShortLine(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return [];
  }
  const cleaned = value
    .replace(/[^\w .,:;!?'"()/-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return cleaned ? [cleaned] : [];
}

function briefingFor(difficulty: GmDifficultyLevel, prompt: string) {
  if (difficulty === "easier") {
    return `The dungeon loosens its grip: ${prompt}`;
  }
  if (difficulty === "harder") {
    return `The dungeon adapts and starts guarding its weak points: ${prompt}`;
  }
  if (difficulty === "deadly") {
    return `The table enters boss-pressure mode. Every mistake has teeth: ${prompt}`;
  }
  return `The dungeon keeps the current rhythm while the GM adds context: ${prompt}`;
}

function difficultyScale(difficulty: GmDifficultyLevel) {
  if (difficulty === "easier") {
    return { damageBonus: -1, encounterBudget: 1, hpMultiplier: 0.85 };
  }
  if (difficulty === "harder") {
    return { damageBonus: 1, encounterBudget: 3, hpMultiplier: 1.25 };
  }
  if (difficulty === "deadly") {
    return { damageBonus: 2, encounterBudget: 5, hpMultiplier: 1.5 };
  }
  return { damageBonus: 0, encounterBudget: 2, hpMultiplier: 1 };
}

function labelForDifficulty(difficulty: GmDifficultyLevel) {
  if (difficulty === "easier") {
    return "Make it easier";
  }
  if (difficulty === "harder") {
    return "Make it harder";
  }
  if (difficulty === "deadly") {
    return "Deadly turn";
  }
  return "Keep it steady";
}

function cleanPrompt(value: string) {
  return (
    value
      .replace(/[^\w .,:;!?'"()/-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280) ||
    "Adjust this scene while preserving the authored opendungeon loop."
  );
}

export function normalizeGmHostUrl(value: string) {
  const text = value.trim();
  if (!text) {
    return "";
  }
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(TRAILING_SLASH_RE, "");
  } catch {
    return "";
  }
}

export async function fetchGmHostSnapshot(
  value: string
): Promise<GmHostBridgeResult> {
  const url = normalizeGmHostUrl(value);
  if (!url) {
    return { error: null, snapshot: null, url: "" };
  }

  try {
    const response = await fetch(new URL("/state", url), {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) {
      return {
        error: `Host returned HTTP ${response.status}. Check that this is an opendungeon-host URL.`,
        snapshot: null,
        url,
      };
    }
    const snapshot = (await response.json()) as GmHostSnapshot;
    return { error: null, snapshot, url };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `Could not reach host: ${error.message}`
          : "Could not reach host.",
      snapshot: null,
      url,
    };
  }
}

export async function deliverGmPatchToHost(value: string, draft: GmPatchDraft) {
  const url = normalizeGmHostUrl(value);
  if (!url) {
    return { delivered: false, error: null, url: "" };
  }

  try {
    const response = await fetch(new URL("/gm/patches", url), {
      body: JSON.stringify({
        briefing: draft.playerBriefing,
        difficulty: draft.difficulty,
        id: draft.id,
        operations: draft.operations,
        title: draft.title,
      }),
      cache: "no-store",
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) {
      return {
        delivered: false,
        error: `Host patch endpoint returned HTTP ${response.status}.`,
        url,
      };
    }
    return { delivered: true, error: null, url };
  } catch (error) {
    return {
      delivered: false,
      error:
        error instanceof Error
          ? `Could not deliver patch to host: ${error.message}`
          : "Could not deliver patch to host.",
      url,
    };
  }
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 36) || "patch"
  );
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}
