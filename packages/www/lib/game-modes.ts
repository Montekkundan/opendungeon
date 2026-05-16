export const gameModes = [
  {
    id: "single-player",
    name: "Single Player",
    status: "canonical story",
    summary:
      "The authored opendungeon story loop with local lore, deterministic runs, village progression, and curated runtime assets.",
    details:
      "This is the offline-first RPG path. AI/GM content must not overwrite the canonical story or curated asset set.",
  },
  {
    id: "multiplayer",
    name: "Multiplayer",
    status: "co-op story",
    summary:
      "The same authored story, rules, lore, and assets, with multiple users sharing the run, village, homes, and permissions.",
    details:
      "The current CLI host is the first version of this path. A stronger authoritative sync model is still required for internet-scale play.",
  },
  {
    id: "multiplayer-gm",
    name: "Multiplayer with GM",
    status: "logged-in GM console",
    summary:
      "A Dungeon Master page where a logged-in GM watches players and uses AI-assisted tools to create world-specific lore, levels, quests, and sprites.",
    details:
      "GM-created content is saved per world and must stay separate from canonical single-player assets and story.",
  },
] as const;

export type GameModeId = (typeof gameModes)[number]["id"];
