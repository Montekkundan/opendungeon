# opendungeon

Terminal roguelike RPG built with OpenTUI.

## Features

- Full-screen terminal UI
- Full-screen map with overlay HUD panels
- Start, character, settings, controls, saves, and cloud-login screens
- OpenTUI ASCII title, tabbed settings, sliders, switches, inputs, and scrollbars
- Top-down procedurally generated dungeons
- Single-player runs with co-op/race mode hooks
- Local save/load system
- Local profile and accessibility settings
- Runtime Itch-source actor sprites with no generated actor fallback
- Procedural terminal terrain, item, and dice sprites
- Adjustable camera FOV
- Persistent and runtime UI hide/show controls
- Animated crawler, enemy, item, terrain, and dice sprites
- Multiple animated d20 dice skins
- Turn-based d20 combat
- Enemy targeting and skill selection
- Stat-based flee rolls
- Enemy patrol, chase, aggro radius, and leash behavior
- RPG stats: vigor, mind, endurance, strength, dexterity, intelligence, faith, luck
- Stat-based combat modifiers
- Talent-check event popups
- Success/failure consequences for loot and NPC events
- Inventory, potion, relic, gold, XP, and leveling systems
- Fog of war and enemy movement
- Debug view behind an environment flag

## Run

```bash
bun run dev
```

## Install

Source checkout:

```bash
bun install
bun run dev
```

npm package:

```bash
npm i -g @montekkundan/opendungeon
opendungeon
```

Bun global package:

```bash
bun add -g @montekkundan/opendungeon
opendungeon
```

GitHub Release installer:

```bash
curl -fsSL https://opendungeon.sh/install | bash
opendungeon
```

Homebrew and AUR packaging templates are under `packaging/`. Generated release formulas are written by:

```bash
bun run package:release
```

## Release

```bash
bun run package:check
git tag v0.1.0
git push origin main --tags
```

Publishing a GitHub release builds standalone macOS/Linux archives, `SHA256SUMS`, a Homebrew formula, and an AUR `PKGBUILD`. npm publishing runs from the release workflow when `NPM_TOKEN` is configured.
