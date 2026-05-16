export const wikiSections = [
  {
    title: "Core loop",
    items: [
      "Seeded dungeon floors with fog of war, traps, secrets, notes, stairs, merchants, and bosses.",
      "Turn-based movement where every legal move can reveal cells, trigger tiles, and advance enemy behavior.",
      "Local saves, rolling autosave, save thumbnails, export backups, and a pause-screen save manager.",
    ],
  },
  {
    title: "Combat mechanics",
    items: [
      "d20 initiative and skill checks with critical hits, natural misses, stat modifiers, focus costs, and flee rolls.",
      "Status effects include poison, burn, guarded, weakened, stun, boss phase pressure, and reaction blocks.",
      "Smarter enemies can guard casters, attack from range, ambush, flee, or escalate boss phases.",
    ],
  },
  {
    title: "NPC types",
    items: [
      "Cartographer Venn marks maps, route hints, and quest direction.",
      "Wound Surgeon Iri patches wounds and teaches defensive rhythm.",
      "Shrine Keeper Sol trades blessings and relic lore for focus decisions.",
      "Jailer Maro gives mimic warnings and lockpick branches.",
      "Ash Merchant Pell sells deterministic trade items when the run has enough gold.",
    ],
  },
  {
    title: "Monster types",
    items: [
      "Slimes and moths pressure positioning with simple pursuit.",
      "Ghouls and rust squires punish careless corridor movement.",
      "Necromancers rehearse final-boss patterns before the Root Throne.",
      "Crypt mimics hide inside loot decisions and punish rushed checks.",
      "The grave-root boss carries phase changes and ending branches.",
    ],
  },
  {
    title: "Village and meta-progression",
    items: [
      "The portal room unlocks a village with houses, stations, farm plots, trust, market sales, and prepared food.",
      "Loot can be sold into village coins, then reinvested into weapons, cooking, storage, and upgrades.",
      "Co-op mode tracks shared village state, separate houses, farm permissions, sync warnings, and spectators.",
      "One laptop can run a local host plus multiple guest terminal clients for multiplayer testing.",
    ],
  },
  {
    title: "GM worlds and accounts",
    items: [
      "Supabase is the current auth and world-storage target for website profiles and future cloud saves.",
      "AI-assisted output belongs to GM worlds: validated world config patches, generated asset metadata, and readable run consequences.",
      "Real-time shared-state tech is still separate from the website; the current game lobby server is a WebSocket host.",
    ],
  },
] as const;

export const mechanics = [
  "Movement: arrows, WASD, or Vim-style controls depending on settings.",
  "Interaction: E, Enter, or Space near people, notes, doors, loot, stairs, and world events.",
  "Run panels: I for inventory, B for Book, J/O for quests, M for map, V for village, L for log.",
  "Combat: Tab changes target, 1-6 choose skills, F flees, Enter rolls the selected d20 action.",
  "Accessibility: high contrast, reduced motion, camera FOV, tile scale, minimap visibility, and toast settings are planned controls.",
] as const;
