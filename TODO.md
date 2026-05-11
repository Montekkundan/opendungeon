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
