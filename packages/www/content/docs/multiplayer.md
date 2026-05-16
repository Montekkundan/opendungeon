# Multiplayer

Multiplayer starts local-first. A host terminal owns the authoritative game session, and other terminal sessions join through the host address. This keeps the rules close to the CLI while the website grows invite and account features.

For product planning, Multiplayer means the authored opendungeon story plus multiple players. Multiplayer with GM is a separate mode where a logged-in Dungeon Master can approve AI-assisted world changes from the website.

## What Multiplayer is not

Multiplayer is not a separate random sandbox. It keeps the Single Player story, mechanics, lore, curated assets, final-gate loop, and village progression. Co-op adds live players, shared state, and permissions around that authored loop.

Multiplayer with GM is the separate sandbox-like path. GM worlds can receive approved lore, room, monster, quest, and sprite patches, but those changes belong to that GM-created world instead of the canonical Single Player story.

## Same laptop sessions

You can open multiple terminal tabs on the same laptop and join the same local host. Unsigned guest sessions may run side by side. A signed-in account should not double-join from the same terminal app identity, so Ghostty sessions with the same logged-in identity should report that the account is already in a game.

This makes one-laptop multiplayer a first-class feature. Run the host once, then launch several local clients from different terminal windows, terminal apps, or tabs. Each guest client can use a different `OPENDUNGEON_PLAYER_NAME`, while signed-in clients keep the account-safe active-run lock.

This is useful for playing locally with friends on one machine and for checking a lobby before sharing it across a LAN.

## Authoritative model

The chosen model is host-authoritative. One `opendungeon-host` process coordinates the lobby, records accepted player commands, exposes `/state`, `/commands`, and `/actions`, and broadcasts snapshots plus events to connected clients. Clients render local UI while the host gives the GM console a shared party/action view.

The current command stream includes movement, NPC/story interaction, d20 checks, combat decisions, inventory actions, and village preparation. Commands are sanitized and sequenced by the host, applied against a host-owned session where possible, then mirrored into the human-readable action log with accepted/rejected result messages. `/state.hostState` exposes the latest host-owned command cursor, result, floor, turn, HP, position, and status; the host page and logged-in GM page both render it for debugging. Joined terminal clients consume their own host command results, reconcile floor, turn, HP, position, and status from the host, and resync that authoritative result to the lobby. The next hardening step is making every combat, loot, village, tutorial, and replay surface render from the accepted host state instead of from parallel local simulation.

The website is not the movement authority for the current game. It helps with accounts, invites, and future GM coordination. If browser-native play replaces the CLI host later, it should still keep an authoritative command log instead of peer-to-peer state.

Multiplayer with GM uses the same host-authoritative runtime. The website GM console can propose lore, room, monster, quest, and sprite changes, but every change must be validated, approved, saved to the GM-owned world, and then applied by the host as a command-log event. GM-created assets and lore stay scoped to that world and never replace the canonical Single Player story.

The GM console can also archive the current host snapshot. After linking a running host URL, press `Archive host state` to save connected players, host command results, combat state, delivered patches, and sync warnings for that GM world.

## Host and join

Co-op is the default hosted multiplayer mode. Pass `--mode race` only when you want a same-seed challenge instead of a shared story run.

```txt
opendungeon-host --host 127.0.0.1 --mode coop --seed 2423368 --port 3737
OPENDUNGEON_PLAYER_NAME=Mira opendungeon join http://127.0.0.1:3737
OPENDUNGEON_PLAYER_NAME=Sol opendungeon join http://127.0.0.1:3737
OPENDUNGEON_AUTH_DIR="$(mktemp -d)" OPENDUNGEON_PLAYER_NAME=Guest opendungeon join http://127.0.0.1:3737
```

Use the `OPENDUNGEON_AUTH_DIR="$(mktemp -d)"` form when you want a guaranteed unsigned guest session even if your normal profile is logged in.

For another device on the same network, replace `127.0.0.1` with the host machine LAN address printed by the host command.

For LAN or a small private server, bind the host to all interfaces:

```txt
opendungeon-host --host 0.0.0.0 --mode coop --seed 2423368 --port 3737
```

Then verify from another device:

```txt
curl http://YOUR_LAN_IP:3737/health
opendungeon join http://YOUR_LAN_IP:3737
```

The browser page at the printed lobby URL is a status and invite page. It is not the game renderer. Players still join from terminal clients.

For debugging or GM tooling, the host also exposes JSON endpoints:

```txt
curl http://YOUR_LAN_IP:3737/state
curl http://YOUR_LAN_IP:3737/commands
curl http://YOUR_LAN_IP:3737/actions
curl http://YOUR_LAN_IP:3737/gm/patches
```

The global package uses the same shape:

```txt
opendungeon-host --host 0.0.0.0 --mode coop --seed 2423368 --port 3737
opendungeon join http://YOUR_LAN_IP:3737
```

## Duplicate signed-in account check

Signed-in runs are guarded by a local active-run lock. If the same GitHub or password account is already in a game, another client with the same auth session should stop before opening the run and name the terminal app that owns the session. To test that message:

```txt
OPENDUNGEON_TERMINAL_APP=Ghostty opendungeon join http://127.0.0.1:3737
```

The lobby host also rejects a second connected player with the same signed-in account identity, so the protection still applies on LAN. Guest sessions do not send an account identity and can still run side by side:

```txt
OPENDUNGEON_AUTH_DIR="$(mktemp -d)" OPENDUNGEON_PLAYER_NAME=Guest opendungeon join http://127.0.0.1:3737
```

## Website invite pages

`/create` generates a shareable lobby URL. `/create/[id]` renders the commands friends need. The website does not keep the current CLI WebSocket lobby alive by itself, so the host process still needs to run somewhere reachable.

## Internet play

For internet play, run the host process on a reachable machine and set the public URL that players should use:

```txt
opendungeon-host --host 0.0.0.0 --public-url https://play.example.com --mode coop --seed 2423368 --port 3737
opendungeon join https://play.example.com
```

If you do not own a server, the planned website-hosted path is a Vercel Sandbox experiment: the signed-in host links their Vercel account, the website starts a temporary host under that account, shares the public host URL, and stops it after play. This keeps hosting costs on the host player's Vercel plan, but it still needs lifecycle limits, reconnects, cleanup, and billing guardrails before it should be treated as a supported player flow.

Website-created lobbies can remember the planned host shape, but they do not provision a live internet host yet.

```txt
bun add -g @montekkundan/opendungeon
opendungeon-host --host 0.0.0.0 --public-url "$OPENDUNGEON_PUBLIC_URL" --mode coop --seed 2423368 --port 3737
```

## Future browser play

A Vercel-only page can create invites, explain setup, and store profile state. Browser-native multiplayer needs an authoritative realtime service before the website can replace the CLI host. High-frequency gameplay should stay behind a host process, a dedicated realtime backend, or a future browser adapter that preserves the command-log model.
