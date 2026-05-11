<h1 align="center">opendungeon</h1>

<p align="center">A terminal roguelike RPG built with OpenTUI.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@montekkundan/opendungeon"><img alt="npm" src="https://img.shields.io/npm/v/@montekkundan/opendungeon?style=flat-square" /></a>
  <a href="https://github.com/Montekkundan/opendungeon/actions/workflows/release.yml"><img alt="Release" src="https://img.shields.io/github/actions/workflow/status/Montekkundan/opendungeon/release.yml?style=flat-square" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/Montekkundan/opendungeon?style=flat-square" /></a>
</p>

<p align="center">
  <img src="assets/readme/opendungeon-title.png" alt="opendungeon terminal title screen">
</p>

---

### Installation

```bash
# npm
npm i -g @montekkundan/opendungeon
opendungeon

# Bun uses the npm registry too
bun add -g @montekkundan/opendungeon
opendungeon
```

Check for upgrades:

```bash
opendungeon update
```

### Source Checkout

```bash
bun install
bun run dev
```

### Multiplayer

Start a local lobby:

```bash
opendungeon-host --mode coop --seed 2423368 --port 3737
```

Share the printed lobby URL and command with friends on the same network. For local source testing:

```bash
bun run host -- --mode coop --seed 2423368 --port 3737
```

### Publish

```bash
bun install --frozen-lockfile
bun run package:check
npm publish --access public --otp <6-digit-code>
```

For Bun players, publish to npm. Bun installs global packages from the npm registry, so there is no separate Bun registry step.

### Release

```bash
bun run package:check
git tag v0.1.0
git push origin main --tags
```

The release workflow builds standalone macOS and Linux archives, checksums, a Homebrew formula, and an AUR `PKGBUILD`. The npm publish workflow runs when a GitHub release is published and `NPM_TOKEN` is configured.

### Features

- Procedural dungeon runs with fog of war, traps, secrets, NPCs, merchants, and bosses.
- Turn-based d20 combat with initiative, skills, status effects, reactions, and boss phases.
- RPG classes, stats, talents, equipment rarity, run mutators, and meta-progression.
- Local story, notes, collectibles, Book entries, cutscenes, and alternate ending hooks.
- Portal room and village systems for houses, farming, shops, trust, upgrades, and replayable runs.
- Local save management, autosave, export/import, cloud hooks, and multiplayer lobby state.
