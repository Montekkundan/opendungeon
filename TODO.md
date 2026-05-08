# opendungeon TODO

## Asset System

- [x] Rename old vendor asset paths to `assets/opendungeon-assets`.
- [x] Move bundled runtime sprites into `assets/opendungeon-assets/runtime/actors`.
- [x] Remove source-pack directory names from committed runtime asset paths.
- [x] Replace high-res UI kit sheets with terminal-native runtime UI components.
- [x] Remove unused generated UI component PNGs after terminal-cell sampling proved too lossy.
- [ ] Improve 64x64 actor imports and procedural fallbacks toward richer portrait-like silhouettes.
- [ ] Add optional larger portrait sheets for dialogs, inventory detail, boss reveals, and title screens.
- [ ] Replace procedural d20 with a safely licensed actual animated 64px d20 sheet, or generate a better project-owned one.
- [ ] Add a first-class reference asset importer for refreshing `assets/opendungeon-assets/runtime` with license checks.
- [ ] Add frame tags for `windup`, `impact`, `recover`, `cast-loop`, `pickup`, `block`, and `open`.
- [ ] Add per-character JSON metadata for hitboxes, palette notes, weapon socket positions, and dialog portrait ids.
- [ ] Add more crawlers: duelist, cleric, engineer, witch, grave knight.
- [ ] Add more NPCs: cartographer, wound surgeon, shrine keeper, jailer, merchant.
- [ ] Add more enemies: gallows wisp, rust squire, carrion moth, crypt mimic, grave-root boss.

## Terminal UI

- [x] Replace the title logo with a centered pixel-font `OPENDUNGEON` logo.
- [x] Add bounded/clipped text in the run panel so labels do not overflow their boxes.
- [x] Add pixel-style HUD badges, beveled panels, key badges, and quickbar slots.
- [x] Use clean terminal-native panels, dialogs, quest rows, slots, and status bars.
- [x] Add screenshot/golden visual regression checks for the terminal renderer.
- [x] Use terminal-native UI assets instead of downsampling high-res reference sheets.

## Website

- [x] Add `packages/www` SolidStart scaffold.
- [x] Add opencode-style app shell with `MetaProvider`, `Router`, `FileRoutes`, and language providers.
- [x] Add `en.ts` and `fr.ts` translations.
- [x] Add homepage and docs pages.
- [ ] Add full docs content beyond the first architecture/quickstart page.
- [ ] Add deploy target and production build verification.

## Cloud/Auth

- [x] Add password login command: `opendungeon login <username>`.
- [x] Add GitHub login command path: `opendungeon --login github`.
- [x] Store local auth sessions separately from saves.
- [x] Add local test account: `test` / `opendungeon`.
- [ ] Finish automatic callback capture for Supabase GitHub OAuth.
- [ ] Add account status and token refresh checks to the terminal UI.
- [ ] Encrypted save upload/download.
- [ ] Conflict handling between local and cloud saves.
- [ ] Cloud save browser with account status and sync errors.
- [x] Manual export/import for offline backup.

## AI Admin

- [x] Add `WorldConfig` schema/types/validator.
- [x] Create 50 deterministic initial events per world.
- [x] Split canonical world config from player action log.
- [x] Add stable dungeon anchors for generated content overlays.
- [x] Add quest definitions linked to generated events/entities.
- [x] Add milestone queue flag after completed event thresholds.
- [x] Add Hono API boundary and Vercel Workflow skeleton.
- [x] Add AI Gateway `openai/gpt-image-2` capability check.
- [x] Add Supabase schema migration with pgvector-backed lore memory table.
- [ ] Replace the procedural admin patch fallback with Vercel Workflow model steps.
- [ ] Persist generated world configs and event logs to Supabase for signed-in users.
- [ ] Generate, store, and sample new sprite PNG assets through the `opendungeon-assets` bucket.
- [ ] Add a first-run server setup check for Supabase, AI Gateway, and storage configuration.

## Multiplayer

- [ ] Live co-op state sync.
- [ ] Friend join flow.
- [ ] Combat turn coordination.
- [ ] Hosted lobby with invite code.
- [ ] Race mode leaderboard persistence.
- [ ] Spectator view for work friends.

## Save Management

- [x] Delete saves.
- [x] Continue-last-run shortcut.
- [x] Save compatibility backfill for world config/log fields.
- [x] Rename saves.
- [x] Autosave slot.
- [x] Save thumbnails using the current room crop.
- [x] Save compatibility/migration checks beyond current world-field backfill.

## Character Customization

- [x] Profile name entry in settings.
- [x] Character name entry for each run.
- [ ] Portrait/class variants.
- [x] Starting loadouts.
- [ ] Cosmetic palette selection.
- [ ] Per-character weapon sprites and animation overrides.

## Combat

- [x] Enemy selection UI.
- [x] Basic d20 combat actions.
- [x] More skills.
- [x] Status effects.
- [ ] Initiative order.
- [ ] Reactions and blocks.
- [x] Area-of-effect targeting.
- [x] Boss phase transitions.

## Dungeon Content

- [x] Basic bosses.
- [x] Generated event definitions.
- [x] Generated quest hooks.
- [x] Biome labels in world anchors.
- [x] Gameplay-visible biomes.
- [x] Traps.
- [ ] Merchants.
- [x] Floor modifiers.
- [ ] Secret rooms and locked doors.
- [ ] NPC conversations.

## Packaging

- [x] Package bin entries for `opendungeon` and `opendungeon-host`.
- [ ] First-run setup flow.
- [ ] `opendungeon assets generate` command.
- [x] Terminal capability check and recommended tile scale.

## Codebase Cleanup

- [ ] Move sprite sampling into a dedicated `spriteSampler.ts`.
- [ ] Split tests into session, save store, assets, d20, and UI suites only where it reduces maintenance.
- [x] Add renderer screenshot/snapshot smoke tests.
- [ ] Add debug overlays behind explicit flags only.
- [ ] Move reference asset/cache import code out of `generate-opendungeon-assets.ts` once the asset manifest stabilizes.
- [ ] Remove unnecessary test-case bloat.
