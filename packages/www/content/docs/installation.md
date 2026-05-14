# Installation

Install the published CLI when you want to play the terminal game, or run the repo scripts when you are developing the game and website locally.

## Player install

```txt
curl -fsSL https://opendungeon.xyz/install | bash
opendungeon

bun add -g @montekkundan/opendungeon
opendungeon
opendungeon login test
opendungeon --login github
```

The curl installer downloads the matching macOS or Linux release binary when GitHub release assets are available, then falls back to the published npm package. The global package exposes `opendungeon` for the TUI and `opendungeon-host` for hosted lobby work. Login is optional for local play. Use the test login while checking account-gated flows without a real provider.

## Source checkout

```txt
bun install
bun run headless -- --scenario smoke --assert
bun run web
```

Use the published `opendungeon` command for normal play. Source checkout commands are for contributors: `bun run headless` runs gameplay scripts without drawing the terminal UI, and `bun run web` starts the Next.js website through Portless at `https://opendungeon.localhost`. See `CONTRIBUTING.md` for terminal-client development commands.

## Website development

The website lives in `packages/www`. It uses Next.js, the shadcn preset, Biome through Ultracite, and Portless for the local HTTPS host.

```txt
bun run web
bun run web:verify
bun --cwd packages/www fix
```

If the dev server reports a `.next/dev/lock` error, another Next process is still running. Stop the old process before starting a new one so Portless can point `opendungeon.localhost` at the current server.
