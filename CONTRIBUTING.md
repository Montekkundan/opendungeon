# Contributing

opendungeon is a terminal-first roguelike with a Next.js website, headless test runner, local multiplayer host, Supabase account path, and release packaging in one repo. Keep changes close to the layer you are working on, and prefer tests that exercise the shared game rules instead of only the UI.

## Repository map

- `src/main.ts`: OpenTUI app entrypoint, top-level key handling, screen transitions, local run locks, lobby connection, autosave, and CLI commands such as `join`.
- `src/game/session.ts`: main gameplay state machine: movement, combat, NPC conversations, tutorial gates, village progression, inventory, quests, hub state, toasts, and world-event integration.
- `src/game/dungeon.ts`: seeded dungeon generation, tiles, anchors, actors, and enemy placement helpers.
- `src/game/story.ts`: local story text, NPC dialogue, opening branches, Book entries, cutscenes, and ending text.
- `src/game/saveStore.ts` and `src/game/saveCli.ts`: local save files, autosave, import/export, validation, and save-related CLI commands.
- `src/game/settingsStore.ts`: local profile settings, control schemes, UI preferences, and profile directory resolution.
- `src/ui/screens.ts`: terminal rendering for menus, game HUD, dialogs, village, docs-like panels, inventory, map, combat, tutorial, and cutscenes.
- `src/ui/canvas.ts`: low-level terminal canvas primitives.
- `src/ui/teleportAnimation.ts`: shared portal/teleport transition timing and tile animation helpers.
- `src/assets/`: runtime sprite sampling, generated asset import, pixel sprites, dice/portrait assets, and asset CLI code.
- `assets/opendungeon-assets/`: committed runtime art, source/license notes, and AI-admin sprite skill notes.
- `src/headless/`: scriptable game environment, scenarios, protocol types, balance suite, and CLI for gameplay testing without rendering the terminal UI.
- `tests/scenarios/`: JSONL headless smoke and regression scenarios.
- `src/net/`: local WebSocket lobby host, invite URL parsing, lobby state, LAN/public URL helpers, and connectivity checks.
- `src/cloud/`: Supabase client wrappers, local auth session storage, profile/auth status, cloud save envelopes, generated asset storage, and world persistence.
- `src/server/`: local server/API experiments and AI-admin workflow tests.
- `src/world/`: validated world config schema, deterministic initial world content, and AI-admin patch normalization.
- `src/system/`: terminal diagnostics, first-run setup, update checks, server setup checks, debug flags, and signed-in local run locking.
- `packages/www/`: Next.js website. App routes live in `packages/www/app`, markdown docs live in `packages/www/content/docs`, shared website helpers live in `packages/www/lib`, and reusable UI lives in `packages/www/components`.
- `supabase/migrations/`: SQL migrations for profiles, AI-admin world storage, and cloud-save tables.
- `scripts/`: packaging, version sync, install smoke, and release helper scripts.
- `packaging/`: Docker, Homebrew, AUR, and Ghost packaging surfaces.
- `python/`: Python gym wrapper and tests for agent-style use.

## Local setup

```txt
bun install
bun run dev
bun run headless -- --scenario smoke --assert
bun run web
```

`bun run dev` starts the terminal client from source. `bun run headless` runs scripted gameplay without drawing the terminal UI. `bun run web` starts the Next.js website through Portless at `https://opendungeon.localhost`.

## Testing

Use focused tests while iterating, then run the broader checks before handoff:

```txt
bun test src/game/session.test.ts
bun test src/ui/screens.test.ts
bun test
bun run check
git diff --check
```

For website-only work:

```txt
bun run www:typecheck
bun --cwd packages/www lint
bun run web:build
```

Browser-check the website through Portless before shipping visible website
changes. Start `bun run web`, then verify these routes at a desktop viewport and
a mobile viewport:

```txt
https://opendungeon.localhost/
https://opendungeon.localhost/docs
https://opendungeon.localhost/changelog
https://opendungeon.localhost/create
https://opendungeon.localhost/create/coop-2423368-local?mode=coop&seed=2423368
https://opendungeon.localhost/login
https://opendungeon.localhost/profile
```

The pass condition is simple: the page loads meaningful content, no Next.js
error overlay appears, key route text is visible, and no browser console errors
appear. The create invite route should clearly say that Vercel hosts the invite
instructions while live play still needs `opendungeon-host`.

Use the headless runner for gameplay bugs where UI screenshots are slow or fragile:

```txt
bun run headless -- --scenario smoke --assert
bun run headless -- --scenario combat --assert
```

## Testing Multiplayer On One Laptop

Start one local lobby host:

```txt
bun run host -- --host 127.0.0.1 --mode coop --seed 2423368 --port 3737
```

Loopback binds only accept same-laptop clients, so use `http://127.0.0.1:3737` or `http://localhost:3737` for this flow. If the host prints a LAN URL, it should only be when the host is bound to `0.0.0.0` or an explicit LAN address.

Then open separate terminal windows or tabs for each player:

```txt
OPENDUNGEON_PLAYER_NAME=Mira bun run dev -- join http://127.0.0.1:3737
OPENDUNGEON_PLAYER_NAME=Sol bun run dev -- join http://127.0.0.1:3737
OPENDUNGEON_PLAYER_NAME=Iri bun run dev -- join http://127.0.0.1:3737
```

Guest sessions are allowed to run side by side on the same laptop. If your normal profile is signed in and you want a clean guest client, point that terminal at an empty auth directory:

```txt
OPENDUNGEON_AUTH_DIR="$(mktemp -d)" OPENDUNGEON_PLAYER_NAME=Guest bun run dev -- join http://127.0.0.1:3737
```

Signed-in sessions use a local active-run lock. Starting the same signed-in account twice should be blocked with a message that says the account is already in a game and names the terminal app, such as Ghostty. You can override the terminal label while testing that path:

```txt
OPENDUNGEON_TERMINAL_APP=Ghostty bun run dev -- join http://127.0.0.1:3737
```

For LAN testing from another device, bind the host to all interfaces and use the LAN URL printed by the host:

```txt
bun run host -- --host 0.0.0.0 --mode coop --seed 2423368 --port 3737
```

## Contribution notes

- Keep deterministic game logic in `src/game` and rendering-specific behavior in `src/ui`.
- Add or update headless scenarios for rule changes that should work without the terminal renderer.
- Add UI snapshot expectations when visible terminal output changes intentionally.
- Keep generated or downloaded art out of runtime paths until it has license notes and terminal sampling.
- Do not commit local `.env.local`, save files, active-run locks, or Supabase secrets.
