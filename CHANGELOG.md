# @montekkundan/opendungeon

## 0.1.6

### Patch Changes

- a9024fa: Add readable boss phase telegraphs, Book notes for phase shifts, and village aftermath demand after boss defeats.
- 072435b: Expose combat balance odds for d20 hit chance, flee chance, focus pressure, death risk, monster matchup notes, and projected class win rate.
- 124ad8d: Add saved co-op village permissions for houses, farms, storage, shop shelves, and shared upgrade spending.
- b844aa1: Add a headless first-clear acceptance scenario that covers tutorial handoff, final gate clear, village preparation, and next-descent meta-progression. Ended runs now explain village recovery and use the next descent path when village progress is already unlocked. Tutorial-off runs and village-launched descents now keep the final-gate quest focused, and the village now exposes fresh, current-seed, and daily-challenge seed plans before launch. Multiplayer now has an automated host smoke test for guests, spectators, state sync, disconnects, and results. Website docs now separate Single Player, Multiplayer, and Multiplayer with GM, including local one-laptop multiplayer expectations. Terminal, CLI, README, and invite UI now use explicit play-mode language while keeping coop/race as lobby variants. Create/invite docs now state that Vercel hosts instructions, while live play still needs an opendungeon-host process. Lobby join and host startup errors now explain bad URLs, unreachable hosts, bind failures, and seed or mode overrides. Contributor docs now include the desktop and mobile browser route checks for home, docs, changelog, create, invite, login, and profile pages. Package install smoke now runs help, doctor, host help, version, and a short headless gameplay smoke after npm and Bun global installs. Multiplayer docs now define the host-authoritative command-log model and the long-running backend requirement for internet play. Contributor verification now has one command that covers gameplay, UI snapshots, headless scenarios, website verification, and package readiness. Reduced-motion mode now suppresses portal/village transition timing, dice-roll timers, and animated dice frames across combat, skill checks, and the quickbar. Level-up talents now require an explicit numbered selection before Enter confirms the choice. The authored first-clear arc now resolves at Floor 3, including default world generation, save summaries, server world defaults, and final guardian placement. Combat talent effects now appear on skill rows and in selected-skill detail text, so passive upgrades such as Pathfinder are visible during fights. Inventory slot details now follow the exact hovered/highlighted slot, consumables have shared use handling, and passive or village-bound items explain what they are for instead of showing no-op copy. NPC conversation choices now use stacked readable rows so long options such as Shrine Keeper relic lore are not hidden in narrow columns. A new in-run state sheet on C shows full stats, learned talents, pending level rewards, equipment, floor modifiers, and combat math. Village location, market, and status text now wrap inside the village screen instead of hiding important instructions behind ellipses. Village-launched descents now apply strategic enemy pressure, increasing enemy HP, guard behavior, aggro range, and damage so post-first-clear battles last longer. Inventory now has explicit inspect, use, equip, drop, stash, sell, and compare flows instead of relying only on Enter-use. The logged-in `/gm` page now supports Supabase-backed GM worlds, difficulty patch drafts, tool-call previews, and approval events for the future host bridge. Important in-game panels now wrap or hard-fit text without ellipsis truncation for conversations, talent checks, inventory details, and village instructions. Inventory slots now render larger category-colored item cards and clearer selected-item details instead of tiny placeholder glyphs. The village map now renders terrain, paths, trees, building sprites, restoration states, NPC sprites, and the player sprite instead of a text-only grid. The GM console can now read live `opendungeon-host` player state and deliver approved GM patches into the host queue, and terminal clients show those GM patches as run logs and toasts. Delivered GM patches now carry validated operations that can adjust live enemy HP, damage, encounter pressure, and briefing text.
- 5e2388d: Fix local multiplayer startup so loopback hosts no longer advertise unreachable LAN URLs and `OPENDUNGEON_PLAYER_NAME` controls each guest terminal's crawler name. Add website/docs groundwork for explicit Single Player, Multiplayer, and logged-in Multiplayer with GM modes. Add OpenTUI music playback, audio settings, bundled runtime music loops, and the global `Ctrl+O` mute shortcut. Preserve village meta-progression when starting the next descent from the village.
- 332401a: Define floor-specific tactical plans for the first three-floor arc and later descents, including each floor's Book note purpose, biome hook, monster mix, NPC/event hook, final-gate clue, transition copy, and procedural enemy pool.
- 4f15768: Add GM host snapshot archiving from the website into Supabase world events so co-op actions and command results can be audited per world.
- 781b945: Add a validated GM tool-call allowlist and transcript-style GM console history so AI-assisted multiplayer world changes stay reviewable before host delivery.
- 13d6bb0: Expand inventory decisions with prepared-food buffs, combat/traversal/emergency tool use, cursed reward tradeoffs, richer equipment stat bonuses, and comparison text that explains candidate gear against the currently equipped slot.
- 601acf5: Add weekly challenge seeds, fixed challenge mutators, and local replay leaderboard metadata for village-launched challenge descents.
- 7013d7a: Add a live multiplayer action log to `opendungeon-host`, expose it through `/state` and `/actions`, stream local player actions from terminal clients, and show the log in the host page plus the logged-in GM console.
- 59f63cb: Reconcile joined terminal clients with accepted or rejected host command results so local state and remote co-op markers follow the host-owned session.
- f721547: Add typed multiplayer command envelopes to `opendungeon-host`, expose accepted commands through `/commands`, and mirror them into the GM-readable action log.
- 9e312cb: Guard hosted multiplayer lobbies against duplicate signed-in player identities while keeping guest terminal sessions unrestricted.
- 2e6ca7c: Make hosted multiplayer default to co-op, surface remote party members in the dungeon HUD/map/radar, document same-laptop/LAN/internet host commands, and add AI Gateway-backed GM patch drafting with deterministic fallback.
- 122aed9: Expose the host-owned authoritative command result state in lobby snapshots, the host status page, and the GM console.
- 5583c7f: Apply multiplayer command envelopes against a host-owned session where possible and expose accepted or rejected command results for GM tooling.
- e7208fc: Expand generated quest chains into explicit escort, rescue, timed curse, shrine repair, bounty, merchant delivery, and final-gate key arcs with floor-spanning objectives and village-facing completion rewards.
- 4e44949: Shorten the first-clear arc so the tutorial leads into a Floor 2 final gate before the first village visit.
- 53ad60e: Add a village calendar with seasons, weather, festivals, and next-descent dungeon modifiers tied to village events.
- cdc3daf: Add village crafting recipes for food, gate bombs, and charms using dungeon loot, crops, stations, and trust.
- d9b45bc: Add the public website curl installer route and documentation for installing opendungeon from `https://opendungeon.xyz/install`.
- 1fc8396: Persist logged-in website lobby creation in Supabase world metadata while keeping the live WebSocket host as an external CLI/server process.
- 4c6c3c4: Add a website Vercel Sandbox host plan for multiplayer invite pages and persist the planned provider, port, commands, lifecycle, docs, and guardrails in Supabase lobby metadata.

## 0.1.5

### Patch Changes

- ad2988c: Start the broad fixes lane with smoother opening transitions, richer opening dialogue choices, stronger headless coverage, and a Next.js website conversion for docs, profile login, and multiplayer invite pages.

## 0.1.4

### Patch Changes

- 01dcec7: Polish the opening descent scene, quest journal, inventory, full dungeon map overlay, in-run action hints, npm/Bun global install launchers, hosted lobby URLs, and close-run flow.

## 0.1.3

### Patch Changes

- 8fbbf9f: Enable auto-merge for generated Changesets release pull requests.

## 0.1.2

### Patch Changes

- 0d8c766: Use npm Trusted Publishing and remove server migration files from the player package.

## 0.1.1

### Patch Changes

- 54426a4: Add title-screen update checks and main-branch npm release automation.
