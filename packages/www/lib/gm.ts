export const gmDifficultyLevels = [
  "easier",
  "steady",
  "harder",
  "deadly",
] as const;

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
  approvalChecklist: string[];
  difficulty: GmDifficultyLevel;
  id: string;
  operations: GmPatchOperation[];
  playerBriefing: string;
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
  title: string;
}

export interface GmHostSnapshot {
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
