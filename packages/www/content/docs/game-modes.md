# Game modes

The project now treats the modes as three separate product promises. They can share rules and assets, but they should not blur ownership of story, saves, or generated content.

## Mode boundaries

- Single Player owns the canonical offline story, deterministic dungeon loop, curated assets, local saves, tutorial, village, and replayable meta-progression.
- Multiplayer owns the same canonical story and assets, with shared live players, shared village state, separate houses, guest sessions, spectators, and duplicate signed-in account protection layered on top.
- Multiplayer with GM owns GM-created worlds only. AI and GM patches should be validated, previewed, approved, stored per world, and streamed after approval. They should not rewrite Single Player content.

## Single Player

Single Player is the canonical authored loop: wake in the dungeon, learn the rules, clear the final gate, return to the village, prepare another descent, and keep local-first progress. The lore, mechanics, and curated runtime assets belong to opendungeon itself.

AI-generated or GM-created content should not overwrite this canonical story path. It can inspire future authored updates, but it should enter the game through reviewed code, content packs, or explicit player opt-in.

Use Single Player when you want the authored roguelike RPG: tutorial rooms, d20 checks, combat, Book entries, final-gate clues, village upgrades, and later descents without network setup.

## Multiplayer

Multiplayer uses the same authored story loop, mechanics, lore, and assets, but adds multiple players to the shared dungeon and village. The target feel is Stardew-style co-op: shared farm and village state, separate player houses, shared dungeon objectives, and permissions for storage, upgrades, and shop/farm work.

The current CLI host is the first implementation. It can run same-laptop or LAN sessions, but internet-grade co-op still needs a stronger authoritative sync model.

Use Multiplayer when friends should play the same canonical run together. One local host process coordinates the lobby. The host and guests can run on one laptop, across terminal apps, or across LAN when the host binds to a reachable address.

## Multiplayer with GM

Multiplayer with GM is for a logged-in Dungeon Master or Game Master. The GM uses a website console to watch connected players, read action logs, prompt an AI assistant, preview tool-call output, generate small terminal-safe sprites, and approve validated changes before players receive them.

GM content belongs to a GM-created world in Supabase. New lore, room layouts, quests, monster variants, and generated assets must stay separate from the canonical Single Player story and from other users' worlds.

Use Multiplayer with GM when the table wants D&D-style authorship: the GM can ask AI for lore, rooms, monster variants, quests, or sprite prompts, then approve safe patches into that GM world. This mode requires login, Supabase ownership, AI Gateway model calls, validated tool calls, and realtime delivery before it can be live.

## Current status

- `/create` creates invite pages and commands for CLI-hosted multiplayer.
- `/gm` is a logged-in website shell for the future GM console.
- The terminal client still owns the current live game loop.
- Automated lobby smoke tests cover host startup, two guest players, spectator join, WebSocket state sync, disconnect, and result submission.
- Realtime GM patches need Supabase world ownership, schema validation, an AI Gateway chat route, tool-call audit records, and a realtime delivery path before players can receive generated changes.
