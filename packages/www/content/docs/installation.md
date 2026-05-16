# Installation

Install the published CLI when you want to play the terminal game.

## Player install

```txt
curl -fsSL https://opendungeon.xyz/install | bash
opendungeon

bun add -g @montekkundan/opendungeon
opendungeon
opendungeon --login github
```

The curl installer is the simplest path. The npm install path is useful when you already use Bun for global packages. The global package exposes `opendungeon` for the terminal game and `opendungeon-host` for hosted lobby work. Login is optional for local play.

## Start playing

```txt
opendungeon
```

Use the title screen to start a new descent, continue a save, open settings, or join multiplayer.
