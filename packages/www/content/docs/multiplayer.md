# Multiplayer

Multiplayer starts local-first. A host terminal owns the authoritative game session, and other terminal sessions join through the host address. This keeps the rules close to the CLI while the website grows invite and account features.

For product planning, Multiplayer means the authored opendungeon story plus multiple players. Multiplayer with GM is a separate mode where a logged-in Dungeon Master can approve AI-assisted world changes from the website.

## What Multiplayer is not

Multiplayer is not a separate random sandbox. It keeps the Single Player story, mechanics, lore, curated assets, final-gate loop, and village progression. Co-op adds live players, shared state, and permissions around that authored loop.

Multiplayer with GM is the separate sandbox-like path. GM worlds can receive approved lore, room, monster, quest, and sprite patches, but those changes belong to the GM-created Supabase world instead of the canonical Single Player story.

## Same laptop sessions

You can open multiple terminal tabs on the same laptop and join the same local host. Unsigned guest sessions may run side by side. A signed-in account should not double-join from the same terminal app identity, so Ghostty sessions with the same logged-in identity should report that the account is already in a game.

This makes one-laptop multiplayer testing a first-class feature. Contributors can run the host once, then launch several local clients from different terminal windows, terminal apps, or tabs. Each guest client can use a different `OPENDUNGEON_PLAYER_NAME`, while signed-in clients keep the account-safe active-run lock.

The automated host smoke test covers this shape without opening terminal windows. It starts a real lobby host, connects two guest players and one spectator, sends sync packets, disconnects one player, and submits a result.

## Authoritative model

The chosen model is host-authoritative. One `opendungeon-host` process owns the run, validates player actions, appends them to a deterministic command log, and broadcasts snapshots plus events to connected clients. Clients render and predict local UI, but they do not decide combat results, tutorial gate progress, loot grants, village state, or GM patch application.

The command log is the shared truth for co-op. Movement, tutorial checklist rows, NPC choices, d20 rolls, combat actions, inventory changes, village preparation, and final-gate progress should become typed commands. That keeps local co-op, LAN play, replay/debug tooling, and later cloud persistence on the same rule path.

Supabase Realtime is not the movement authority for the current game. It is the account, presence, persistence, and GM coordination layer: profiles, cloud saves, world ownership, action-log uploads, GM patch rows, and approved-patch notifications. If browser-native play replaces the CLI host later, it should still keep an authoritative command log instead of peer-to-peer state.

Multiplayer with GM uses the same host-authoritative runtime. The website GM console can propose lore, room, monster, quest, and sprite changes, but every change must be schema-validated, approved, written to the GM-owned world in Supabase, and then applied by the host as a command-log event. GM-created assets and lore stay scoped to that world and never replace the canonical Single Player story.

## Host and join

```txt
bun run host -- --host 127.0.0.1 --mode coop --seed 2423368 --port 3737
OPENDUNGEON_PLAYER_NAME=Mira bun run dev -- join http://127.0.0.1:3737
OPENDUNGEON_PLAYER_NAME=Sol bun run dev -- join http://127.0.0.1:3737
OPENDUNGEON_AUTH_DIR="$(mktemp -d)" OPENDUNGEON_PLAYER_NAME=Guest bun run dev -- join http://127.0.0.1:3737
```

The `--` after `bun run dev` passes the `join` command to the terminal client. Use the `OPENDUNGEON_AUTH_DIR="$(mktemp -d)"` form when you want a guaranteed unsigned guest session even if your normal profile is logged in.

For another device on the same network, replace `127.0.0.1` with the host machine LAN address printed by the host command.

For LAN or a small private server, bind the host to all interfaces:

```txt
bun run host -- --host 0.0.0.0 --mode coop --seed 2423368 --port 3737
```

The browser page at the printed lobby URL is a status and invite page. It is not the game renderer. Players still join from terminal clients.

## Duplicate signed-in account check

Signed-in runs are guarded by a local active-run lock. If the same GitHub or password account is already in a game, another client with the same auth session should stop before opening the run and name the terminal app that owns the session. To test that message:

```txt
OPENDUNGEON_TERMINAL_APP=Ghostty bun run dev -- join http://127.0.0.1:3737
```

## Website invite pages

`/create` generates a shareable lobby URL. `/create/[id]` renders the commands friends need. The website does not keep the current CLI WebSocket lobby alive by itself, so the host process still needs to run somewhere reachable.

## Future browser play

A Vercel-only page can create invites, explain setup, and store profile state. Browser-native multiplayer needs an authoritative realtime service before the website can replace the CLI host. Supabase Realtime can help with presence and approved GM updates, but high-frequency gameplay should stay behind a host process, a dedicated realtime backend, or a future browser adapter that preserves the command-log model.
