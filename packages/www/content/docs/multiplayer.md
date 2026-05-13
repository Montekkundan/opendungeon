# Multiplayer

Multiplayer starts local-first. A host terminal owns the authoritative game session, and other terminal sessions join through the host address. This keeps the rules close to the CLI while the website grows invite and account features.

## Same laptop sessions

You can open multiple terminal tabs on the same laptop and join the same local host. Unsigned guest sessions may run side by side. A signed-in account should not double-join from the same terminal app identity, so Ghostty sessions with the same logged-in identity should report that the account is already in a game.

This makes one-laptop multiplayer testing a first-class feature. Contributors can run the host once, then launch several local clients from different terminal windows, terminal apps, or tabs. Each guest client can use a different `OPENDUNGEON_PLAYER_NAME`, while signed-in clients keep the account-safe active-run lock.

## Host and join

```txt
bun run host -- --host 127.0.0.1 --mode coop --seed 2423368 --port 3737
OPENDUNGEON_PLAYER_NAME=Mira bun run dev -- join http://127.0.0.1:3737
OPENDUNGEON_PLAYER_NAME=Sol bun run dev -- join http://127.0.0.1:3737
OPENDUNGEON_AUTH_DIR="$(mktemp -d)" OPENDUNGEON_PLAYER_NAME=Guest bun run dev -- join http://127.0.0.1:3737
```

The `--` after `bun run dev` passes the `join` command to the terminal client. Use the `OPENDUNGEON_AUTH_DIR="$(mktemp -d)"` form when you want a guaranteed unsigned guest session even if your normal profile is logged in.

For another device on the same network, replace `127.0.0.1` with the host machine LAN address printed by the host command.

## Duplicate signed-in account check

Signed-in runs are guarded by a local active-run lock. If the same GitHub or password account is already in a game, another client with the same auth session should stop before opening the run and name the terminal app that owns the session. To test that message:

```txt
OPENDUNGEON_TERMINAL_APP=Ghostty bun run dev -- join http://127.0.0.1:3737
```

## Website invite pages

`/create` generates a shareable lobby URL. `/create/[id]` renders the commands friends need. The website does not keep the current CLI WebSocket lobby alive by itself, so the host process still needs to run somewhere reachable.

## Future browser play

A Vercel-only page can create invites, explain setup, and store profile state. Browser-native multiplayer needs a realtime transport such as Supabase Realtime or another state server before the website can replace the CLI host.
