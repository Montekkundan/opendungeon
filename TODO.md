# opendungeon TODO

## Current Polish Pass

- [x] Review the OpenTUI examples under `packages/examples/src` and reuse the useful patterns: tabbed detail screens, disabled menu rows, explicit key handling, scrollable/detail panes, mouse hit-test style interaction, framebuffer rendering, and timer-driven animation.
- [x] Add internet reachability state to the title screen.
- [x] Disable multiplayer and cloud login while internet is offline or still being checked.
- [x] Add a tabbed Tutorial screen covering movement, combat, stats/levels, items, quests/NPCs, saves/autosave, cloud, and multiplayer.
- [x] Keep the local save browser usable for load, rename, delete, refresh, thumbnail detail, and continue-last-run.
- [x] Add a quit dialog from `q` during a run when the current state is newer than the last manual save, with Save & Quit, Quit Anyway, and Cancel paths.
- [x] Improve autosave by keeping the rolling autosave slot current after gameplay changes and on a periodic in-run timer.
- [x] Validate procedural map replayability through the headless map-generation tests.
- [x] Validate NPC conversation, merchant, save/load, save-management, combat, skills, status effects, and full-run loops through headless scenarios.

## Latest Playtest Bugs And Requested Fixes

- [ ] GM difficulty steering: in `/gm`, let a logged-in GM steer the AI/agent from the multiplayer web view to make the current world harder or easier in a D&D-style way. The logged-in world selector, difficulty prompt, Supabase draft event, patch preview, and approval queue are landed; remaining work is live player/state ingestion, AI Gateway model calls, and host delivery to connected players after validation.
- [x] Level-up talent selection bug: pressing Enter currently selects the top talent too easily. Require an explicit `1`, `2`, `3`, etc. choice first, then Enter confirms the highlighted/numbered talent.
- [x] Talent unlock bug: unlocked talents such as Pathfinder must visibly affect available combat moves, combat strategy text, or the relevant stats. If a talent is passive-only, label it as passive in the state/character screen instead of implying it should appear as a fight move.
- [x] Inventory hover/detail bug: the inventory detail pane should describe the hovered/highlighted item, not a stale or previously selected item.
- [x] Item action design bug: items that currently say "No apply action yet" need real handling. Decide and implement inspect/equip/use/sell/drop/stash paths, and make unavailable actions explain what the item is for.
- [x] Add a fuller inventory action menu after the no-op bug fix: explicit equip, drop, stash, compare, and village sell flows instead of only Enter-use plus passive explanations.
- [x] NPC conversation choice layout: long choices such as Shrine Keeper "Take blessing" and "Ask relic lore" should render as readable stacked rows instead of narrow hidden columns.
- [x] Village text wrapping: selected-location descriptions, market logs, and long village status lines should wrap in their panels instead of hiding important instructions behind ellipses.
- [x] Text truncation regression: Shrine Keeper choices such as "Take blessing" / "Ask relic..." are cut off. Audit the entire game for `...` on important instructions, choices, item text, village panels, NPC dialogue, and action prompts; wrap, scroll, or add a detail pane instead.
- [x] First arc pacing change: send the player to the village after Floor 3 instead of waiting until Floor 5. Update final-floor rules, story copy, tutorial handoff, headless first-clear scenario, docs, and balance expectations.
- [x] Add a state/character sheet screen that shows full stats, skill tree, unlocked talents, passive/active effects, level-up rewards, equipment bonuses, current run modifiers, and what each reward changed.
- [ ] Redesign the inventory screen visuals: improve item sprites/icons, slot layout, selected/hover detail, action hints, comparison text, and terminal readability so pack items no longer look like placeholder glyphs.
- [x] Rebalance post-tutorial combat for a 3-floor first arc: Floor 3 should remain approachable, but later descents need strategic battles with enemy roles, resistances/weaknesses, focus pressure, positioning, and multi-turn decisions instead of one-hit clears.
- [ ] Replace the current mostly-text village with a real walkable sprite village: player sprite, NPC sprites, trees, walls, paths, homes, shop, farm, broken hut/ruins, restoration states, and visible upgrades as buildings improve.

## Next Gameplay Improvements To Approve

- [x] Add selectable NPC dialogue options with run-affecting outcomes for map, healing, blessings, keys, rumors, and merchant trade branches.
- [x] Add class talent choices on level-up, with talents that modify stats, focus costs, damage, and rest recovery.
- [x] Add a full local story script with all NPC dialogue options through the end boss, so solo players get a complete replayable roguelike story offline.
- [x] Shift the local story premise toward the player waking in the dungeon with no memory, then learning mechanics through NPCs, notes, and tutorial context.
- [x] Add a Book/knowledge tab for discovered memories, NPC hints, notes, and run lore.
- [x] Add event toasts for major moments such as fight results, level-ups, room discoveries, traps, and d20 success/failure outcomes.
- [x] Add a larger co-op lobby state test for four players plus spectator turn coordination.
- [x] Source more small pixel-art assets from itch.io for upcoming features, focusing on 8x8, 16x16, and similar tiny packs that read well in OpenTUI terminal cells.
- [x] Use searches like `https://itch.io/search?classification=assets&type=games&q=18x18`, plus 8x8 and 16x16 variants, to evaluate free-only asset packs for dungeon, village, portal room, farming, shops, NPCs, items, and UI icons.
- [x] Download only free assets with usable licenses, record license/source notes, and import only packs that look good after terminal sampling rather than just in browser previews.
- [x] Use Helium/Computer Use for asset browsing and cmux or the local terminal to inspect the running game UI with `bun dev` when deciding whether an asset pack actually fits.
- [x] Used Helium/Computer Use to browse itch.io asset searches such as `https://itch.io/search?q=18x18`; downloaded the free CC0 Bountiful Bits pack, saved license/source notes, imported the civilized sheet, and sampled it for dungeon door/hazard sprites.
- [ ] Build a repeatable free-asset intake lane: download to a temporary source folder, write a reference import manifest, run `opendungeon assets import --manifest <path> --dry-run`, import only approved sheets under `assets/opendungeon-assets/runtime`, then add screenshot/test evidence that the pack improves the game.
- [x] Add simple terminal-safe screen transitions with fade/slat overlays for current menu changes and portal-style game entry/load.
- [x] Add dedicated portal-room and village arrival animations once those screens exist.
- [x] Add physical note collectibles as dungeon objects that feed the Book tab.
- [x] Add additional collectible types beyond notes: recipes, tool parts, and village deeds.
- [x] Add rarer collectible types such as fossils, boss memories, friendship keepsakes, and AI-admin story relics.
- [x] After the first dungeon clear, unlock a portal room/personal house hub where the player returns between runs.
- [x] Add buildable hub stations: quarry, blacksmith, kitchen, storage, farm plots, and upgrade benches.
- [x] Add Moonlighter-style village economy where dungeon loot can be sold for money, then reinvested into weapons, food, shops, and NPC services.
- [x] Add Dave the Diver / Dead Cells style meta-progression where prepared food, upgraded weapons, and unlocked gear affect the next run without removing roguelike risk.
- [x] Add village NPC trust levels, with quests that unlock stronger weapons, recipes, upgrades, discounts, and story branches.
- [x] Add a Stardew-style multiplayer village layout with one shared village and separate player houses.
- [x] Add farming and selling loops in the village, then later automation helpers such as pets, butlers, selling assistants, and sprinklers.
- [x] Later: let AI Admin remix or replace the local story script, including alternate endings, changed boss motives, and world-state consequences.
- [x] Later: let AI Admin change village story arcs, NPC trust outcomes, portal-room upgrades, and alternate endings through dev/admin tools.
- [x] Test multiplayer with larger groups, including co-op fights, stat distribution, inventory management, save/sync conflicts, spectators, disconnects, and race submissions.
- [x] Add longer-term NPC relationship/reputation memory across multiple encounters.
- [x] Expand skill trees into multi-tier branches per class with exclusive late-game choices.
- [x] Add equipment stats, rarity, and active item effects so loot changes the run strategy.
- [x] Add smarter enemy behaviors: ranged attackers, guards that protect casters, ambushers, and enemies that flee.
- [x] Add more quest types: escort, rescue, timed curse, locked shrine, bounty, and multi-floor objective chains.
- [x] Add run mutators for replayability: daily seed, hard mode, cursed floors, class challenge, and boss-rush mode.
- [x] Add a proper save-management modal inside pause/gameplay so players can save, load, rename, delete, and export without returning to title.
- [x] Add internet-aware AI-admin status in the UI showing account, server setup, sync health, and pending world-generation work.
- [x] Add a headless balance suite that runs many random seeds/classes and reports death rate, average floor reached, level curve, and common stop states.
- [x] Add richer terminal UI polish from OpenTUI patterns: focus rings, tab descriptions, scroll indicators, hover/click affordances, and animated combat feedback where terminals support it.
- [x] Improve event toasts so the newest message wraps full text, older events collapse, only a couple show at once, and the feed clears quickly like action RPG combat notifications.

## Further Improvements To Approve

- [x] Add a dedicated village screen separate from the hub modal, with walkable shop/farm/house tiles and NPC schedules.
- [x] Add generated local cutscenes for first clear, village unlock, and end-boss alternate endings.
- [x] Add a price-discovery shop loop where village customers react differently to loot categories and trust levels.
- [x] Add co-op house customization and shared farm permissions for Stardew-style multiplayer sessions.
- [x] Add a content-pack manager that can swap between terminal-safe asset packs without changing gameplay saves.
- [x] Add a balancing dashboard that compares class win rate, mutator difficulty, average gold earned, and hub upgrade pacing.

## Tutorial To Village Handoff

- [x] Add a one-time post-tutorial handoff on Floor 2: "You are on your own now. Find stairs, survive to Floor 3, and open the road home."
- [x] Rename the active quest after the tutorial to "Find the Final Gate."
- [x] On first dungeon clear, automatically transition to the village screen instead of only saying the portal can open.
- [x] In village, make the first actions obvious: sell loot, build blacksmith, prepare food, and start next descent.
- [x] Keep `V` as the shortcut for returning to village only after the portal is unlocked.

## Finish Game Roadmap For Future Agents

### Critical Flow Fixes

- [x] Fix "start next descent" from the village so it preserves the unlocked hub, coins, stations, trust, houses, farm state, food prep, weapon upgrades, content pack, and active mutators instead of replacing the run with a fresh `createSession` hub. Relevant files: `src/main.ts`, `src/game/session.ts`, `src/game/saveStore.ts`.
- [x] Add a first-clear acceptance path: finish tutorial, reach Floor 3, defeat or clear the final gate, auto-arrive in village, sell loot, build or inspect blacksmith, prepare food, then start the next descent with meta-progression still present.
- [x] Add a headless scenario for the full loop above, plus assertions for quest title, floor transitions, hub unlock, village state persistence, and next-run modifiers.
- [x] Make victory and death recovery explicit: after death, show whether the village/hub progress remains, what was lost, and which key starts the next descent.
- [x] Decide whether "new descent" should use a fresh random seed, a player-chosen seed, or a village challenge seed; expose that choice in the village UI before launching.

### Tutorial And First-Time User Experience

- [ ] Play through the tutorial in Ghostty at multiple terminal sizes and fix text overlap, hidden lines, camera jumps, and unreadable modal content.
- [x] Add tutorial coverage for final gate, village arrival, selling loot, building blacksmith, preparing food, and starting a new descent after the first clear.
- [x] Add a skip/tutorial-off path that still gives experienced players the core quest and starting context without trapping them behind tutorial gates.
- [x] Make all tutorial prompts and talent-check explanations wrap without ellipses at supported terminal sizes.
- [x] Add reduced-motion behavior for tutorial gate opening, teleport, dice, camera, and first-clear transitions.

### Core Gameplay Depth

- [ ] Expand the first three-floor arc and later descents so each floor has a distinct tactical purpose, biome modifier, monster mix, NPC/event hook, and final-gate clue.
- [ ] Add more item and equipment decisions: weapon upgrades, armor/charms, food buffs, bombs/tools, cursed rewards, and clear inventory comparison text.
- [ ] Add more quest chains that span floors and village outcomes: rescue, bounty, timed curse, shrine repair, escort, merchant delivery, and final-gate keys.
- [ ] Finish combat balance around d20 difficulty, focus economy, enemy weakness/resistance notes, flee odds, death rate, and class win rates.
- [ ] Add boss phases with readable telegraphs, Book updates, and aftermath changes in village dialogue and shop demand.
- [ ] Add daily/weekly challenge seeds, challenge mutators, and local leaderboard/replay metadata.

### Village And Meta-Progression

- [ ] Turn the village into a real between-run loop: sell loot, set shop prices, build/upgrade stations, cook/craft, farm/harvest, prepare loadout, and choose next descent.
- [ ] Add a shopkeeper UI for price experiments: choose item, set price, wait for customer reaction, learn demand, and build reputation.
- [ ] Add cooking/crafting recipes that combine dungeon loot, farm crops, and trust unlocks into next-run food, bombs, tools, and charms.
- [ ] Add NPC schedule depth: morning/day/night routines, relationship scenes, trust-gated house visits, and post-boss dialogue changes.
- [ ] Add a village calendar with seasons, weather, festivals, and dungeon modifiers tied to village events.
- [ ] Add co-op village permissions for houses, farm plots, storage, shop shelves, and shared upgrade spending.

### Multiplayer And Network Play

- [x] Test one-laptop multiplayer manually with `bun run host -- --host 127.0.0.1 --mode coop --seed 2423368 --port 3737` and multiple `bun run dev -- join http://127.0.0.1:3737` clients in different terminal tabs/apps. Verified after the loopback URL and process-local player-name fixes.
- [x] Add an automated multiplayer smoke test that covers host startup, two guest clients, spectator join, state sync, disconnect, and race result submission.
- [ ] Verify signed-in duplicate-run locking in Ghostty and another terminal app: same signed-in account should be blocked, separate guest auth dirs should be allowed.
- [x] Make game modes explicit everywhere: Single Player, Multiplayer, and Multiplayer with GM. Avoid mixing race/sync/dev-host concepts with the authored story loop.
- [x] Single Player mode: the authored opendungeon story loop, lore, deterministic dungeon rules, village meta-progression, and curated/local assets; no external GM content should alter this canonical offline story.
- [x] Multiplayer mode: the same authored story loop, lore, rules, and assets as Single Player, but with multiple users sharing the world like Stardew Valley co-op. Shared farm/houses/village permissions should sit on top of the canonical story rather than replacing it.
- [x] Multiplayer with GM mode: a logged-in website-only GM/Dungeon Master flow where the GM sees connected players, live player state, action logs, world status, generated assets, and pending story/level patches.
- [x] Decide the authoritative gameplay model for co-op and GM play: host-owned action relay with a shared deterministic command log. Supabase handles auth, persistence, GM patch rows, and presence/approved-patch notifications, but the current lobby host remains the gameplay authority.
- [x] Build a deployment story for internet multiplayer. Vercel hosts the website/invites, while live play needs `opendungeon-host` on Docker, VPS, Fly/Render/Railway, or another long-running WebSocket-capable backend.
- [x] Add clear error messages for bad lobby URLs, unreachable LAN hosts, port conflicts, stale locks, and mismatched lobby seed/mode.

### Cloud, Supabase, And AI Admin

- [ ] Apply and verify Supabase migrations against the real `opendungeon` project, including RLS policies for profiles, cloud saves, and AI-admin world rows.
- [ ] Connect website profile login end-to-end on local Portless and deployed Vercel, then document exact env vars and callback URLs.
- [ ] Implement cloud save upload/download/conflict UI in the terminal client, with local-first fallback and explicit conflict resolution.
- [ ] Persist generated world configs, player action logs, and AI-admin patches with owner/project boundaries in Supabase.
- [ ] Add an AI-admin review/apply flow that validates JSON patches, shows what changed, supports rollback, and never runs arbitrary generated code.
- [ ] Build `/gm` in `packages/www` as the logged-in GM console. Use the AI Elements chatbot template (`https://elements.ai-sdk.dev/examples/chatbot`) for the chat/workbench surface and Vercel AI SDK with AI Gateway for model calls.
- [ ] Add GM tool calls for validated world changes: create lore patch, create dungeon floor/room patch, spawn NPC/monster, add quest branch, generate sprite prompt, generate image asset, approve asset import, preview patch, apply patch, rollback patch.
- [ ] Add sprite-generation rules for GM-created assets: terminal-safe small pixel art, limited palette, transparent background where useful, no copyrighted likenesses, no text baked into sprites, and metadata for target runtime folder, frame size, license/source, and world ownership.
- [ ] Store GM-created lore, levels, generated sprites, and applied patches per GM-created world in Supabase. These rows must not mix with canonical Single Player assets/story or other users' worlds.
- [ ] Stream GM-approved changes to connected players in real time. Players should see new lore, level changes, and assets only after schema validation and GM approval.
- [ ] Keep SpacetimeDB or another realtime state backend as a later option until Supabase auth/data and local multiplayer are stable.

### Website, Docs, And Contributor Experience

- [x] Add a contributor/docs link from `README.md` and the website docs so new agents can find `CONTRIBUTING.md`.
- [ ] Keep `packages/www/content/docs` in sync with new game mechanics, controls, multiplayer commands, Supabase setup, and deployment decisions.
- [x] Add docs and website copy that clearly separates Single Player, Multiplayer, and Multiplayer with GM, including what works now and which backend pieces still need to land.
- [x] Finish the `/gm` logged-in shell: world selector, player list, AI chat panel, tool-call audit panel, patch preview, asset-generation queue, and Supabase-backed world ownership.
- [x] Add website browser verification for home, docs, changelog, create, create invite, login, and profile pages at desktop and mobile widths.
- [x] Finish `/create` and `/create/[id]` copy so it clearly says what the website can do now and what still needs a running host.
- [x] Add a website feature section for local one-laptop multiplayer, guest sessions, and signed-in duplicate-run blocking.
- [x] Keep the changelog page sourced from Changesets and release notes, and add a changeset for every user-visible gameplay/website change.

### Assets, Accessibility, And UI Polish

- [ ] Add a content-pack import wizard with license checks, runtime folder placement, terminal preview sampling, and accessibility score.
- [ ] Add accessibility controls for toast duration, toast density, UI scale, high-contrast palettes, reduced motion, minimap visibility, and camera FOV.
- [ ] Verify every major screen in Ghostty: title, character, settings, tutorial, game, combat, talent check, inventory, Book tabs, map, village, save manager, cloud, and multiplayer.
- [x] Fix any UI text that truncates important instructions with `...`; action prompts should wrap or use a scrollable/detail panel.
- [ ] Add status-effect and combat-animation variants for poison, burn, guard, flee, ambush, boss phases, natural 20, and natural 1.
- [ ] Keep runtime art terminal-native; do not import high-resolution packs unless they sample cleanly into terminal cells.

### Audio, Music, And SFX

- [x] Rename and import the two local music files into the runtime audio folder with purpose-based names: `Quest_Preparation.mp3` -> `assets/opendungeon-assets/runtime/audio/title-settings-loop.mp3`, and `Beneath_the_Blackened_Stone.mp3` -> `assets/opendungeon-assets/runtime/audio/dungeon-loop.mp3`.
- [x] Add third-party/source notes for the two local MP3s before bundling them in the package, even if they are project-owned.
- [x] Build a real OpenTUI audio layer from `https://opentui.com/docs/core-concepts/audio/`: create one `Audio` engine, handle `error` events, call `start()` only when audio is enabled, load files with `loadSoundFile()` in dev, play music voices with `{ loop: true }`, dispose audio on app shutdown, and fail silently when no output device exists.
- [x] For Bun compiled binaries, import music/SFX with `with { type: "file" }`, read bytes through `Bun.file(...).bytes()`, and use `loadSound()` so packaged executables can decode embedded audio without relying on loose file paths.
- [x] Add named audio groups: `music`, `sfx`, and `ui`; use `setMasterVolume()` for master volume and `setGroupVolume()` for per-group controls.
- [x] Loop `title-settings-loop.mp3` on title, character, mode, saves, cloud, settings, controls, tutorial, village, profile/cloud-style non-dungeon screens, and any non-game modal-only surfaces.
- [x] Loop `dungeon-loop.mp3` only while the active run is visible or the player is inside dungeon gameplay/combat/talent-check/inventory/Book/map overlays; crossfade or stop/swap cleanly when leaving the dungeon.
- [x] Add settings controls for audio: master volume, music volume, SFX volume, music on/off, SFX on/off, mute all, and output-device status/error text.
- [x] Add a global mute/unmute keyboard shortcut that does not conflict with map/inventory/combat controls; use `Ctrl+O` so compact keyboards and macOS media-key rows work reliably.
- [x] Persist audio settings in `src/game/settingsStore.ts`, draw them in the settings audio tab, and apply changes immediately without requiring restart.
- [x] Add SFX hooks for teleport start/end, gate open, d20 roll/success/fail, combat hit/block/crit/flee, item pickup, inventory use, quest update, Book update, village sell/build/cook, and menu confirm/cancel. Current cues are project-owned synthesized WAV bytes loaded through OpenTUI `loadSound()`; richer external packs remain a separate sourcing task.
- [ ] Source more free audio from itch.io/OpenGameArt/Kenney/related free-audio sites for teleportation, UI, combat, loot, village, and ambient effects; only import packs with clear commercial-use licenses such as CC0, CC-BY, MIT, or project-owned terms.
- [ ] Use Helium/Computer Use for browsing audio packs and keep the same intake discipline as sprites: download to temp/cache, record source/license, audition samples, normalize filenames, import approved files under `assets/opendungeon-assets/runtime/audio`, and add tests or a manifest check.
- [x] Add an audio manifest that lists track id, source file, intended screens/events, loop flag, volume defaults, license id/source, and whether it is canonical single-player content or GM/world-specific generated content.
- [ ] Make GM/generated-world audio separate from canonical assets: AI/GM worlds can add custom music/SFX per world in Supabase, but those files must not replace the Single Player soundtrack.

### Packaging, Release, And Cross-Platform Validation

- [ ] Remove or isolate Bun-only assumptions from the globally installed `opendungeon` package so Windows/macOS/Linux users can run the published CLI reliably.
- [x] Add install smoke coverage for npm global install on macOS, Linux, and Windows, including `opendungeon --help`, `opendungeon doctor`, and a short run start.
- [ ] Keep `bun run package:check`, `bun test`, `bun run check`, `bun pm pack --dry-run`, and Changesets status green before release.
- [ ] Verify trusted publishing and release workflow behavior after every changeset or package metadata change.
- [ ] Audit public repo hygiene before pushing: no `.env.local`, local saves, active-run locks, Supabase secrets, or accidental checkpoint artifacts.
- [ ] Update `README.md`, website docs, and `CHANGELOG.md` for each release-facing change.

### Definition Of Finished Enough For 1.0

- [ ] A new player can install, start a run, complete the tutorial, understand d20 checks/combat, clear the first dungeon arc, enter the village, prepare a second descent, and save/load without reading source code.
- [x] A contributor can run one command set to verify gameplay, UI snapshots, website build, headless scenarios, and package readiness.
- [ ] Local multiplayer works on one laptop and LAN with documented host/join commands, guest sessions, duplicate signed-in account protection, and clear failure messages.
- [ ] Website docs explain install, controls, mechanics, monsters, NPCs, village, multiplayer, Supabase, deployment, changelog, and contributing in the same visual style.
- [ ] Cloud/profile features work with Supabase locally and on Vercel without private secrets leaking to the browser or repo.
- [ ] The release package runs on supported platforms and does not depend on a developer-only local environment.

## More Further Improvements To Approve

- [ ] Add a village calendar with seasons, weather, festivals, and dungeon modifiers tied to village events.
- [ ] Add deeper NPC schedule simulation with morning/day/night routines, relationship scenes, and trust-gated house visits.
- [ ] Add a proper shopkeeper UI for price experiments: set price, wait for customer reactions, learn demand curves, and build shop reputation.
- [ ] Add cooking and crafting recipes that combine dungeon loot, farm crops, and trust unlocks into next-run food, bombs, tools, and charms.
- [ ] Add a co-op permissions screen for houses, farm plots, storage, shop shelves, and shared upgrade spending.
- [ ] Add a content-pack import wizard with free-license checks, terminal preview sampling, and per-pack accessibility scores.
- [ ] Add local daily/weekly challenge boards with replay ghosts, fixed seeds, mutator bundles, and class-specific medals.
- [ ] Add accessibility controls for toast duration, toast density, UI scale, high-contrast palettes, and reduced combat animation.
- [ ] Add village aftermath scenes after bosses where NPC dialogue, shop demand, crops, and portal-room visuals change.
- [ ] Add status-effect and combat-animation variants for poison, burn, guard, flee, ambush, boss phases, and perfect rolls.
