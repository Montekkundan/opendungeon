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

`localhost` only works on the same computer. For friends on the same Wi-Fi/LAN, host on `0.0.0.0` and share the LAN IP printed by the host.

```bash
# Same Wi-Fi / LAN
opendungeon-host --host 0.0.0.0 --mode coop --seed 2423368 --port 3737
```

Friends join with:

```bash
opendungeon join http://YOUR_LAN_IP:3737
```

For an internet server, open TCP port `3737` and set the public URL or domain:

```bash
opendungeon-host --host 0.0.0.0 --public-url http://YOUR_SERVER_IP:3737 --mode coop --seed 2423368 --port 3737
opendungeon join http://YOUR_SERVER_IP:3737
```

For local source testing:

```bash
bun run host -- --mode coop --seed 2423368 --port 3737
```

Docker/server hosting:

```bash
docker build -f packaging/docker/Dockerfile -t opendungeon-server .
docker run --rm -p 3737:3737 -e OPENDUNGEON_PUBLIC_URL=http://YOUR_SERVER_IP:3737 opendungeon-server --mode coop --seed 2423368
```

Ghost-style server platforms can use `packaging/ghost/opendungeon` as the game template. It follows Ghost's per-game compose-generator shape: `index.ts`, `install.ts`, and `settings.ts`.

### Publish

```bash
bun install --frozen-lockfile
bun run package:check
bun run changeset
git push origin main
```

The main-branch npm workflow opens a Changesets version PR and enables auto-merge for it. Once branch rules are satisfied, that version PR merges and the follow-up main run publishes the new npm version through npm Trusted Publishing. For Bun players, publish to npm; Bun installs global packages from the npm registry, so there is no separate Bun registry step.

### Release

```bash
bun run package:check
git tag v0.1.0
git push origin main --tags
```

The release workflow builds standalone macOS and Linux archives, checksums, a Homebrew formula, and an AUR `PKGBUILD`. npm package publishing is handled by the main-branch Changesets workflow.

### Features

- Procedural dungeon runs with fog of war, traps, secrets, NPCs, merchants, and bosses.
- Turn-based d20 combat with initiative, skills, status effects, reactions, and boss phases.
- RPG classes, stats, talents, equipment rarity, run mutators, and meta-progression.
- Local story, notes, collectibles, Book entries, cutscenes, and alternate ending hooks.
- Portal room and village systems for houses, farming, shops, trust, upgrades, and replayable runs.
- Local save management, autosave, export/import, cloud hooks, and multiplayer lobby state.
