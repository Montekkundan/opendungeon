# Game modes

The project now treats the modes as three separate product promises. They can share rules and assets, but they should not blur ownership of story, saves, or generated content.

## Single Player

Single Player is the canonical authored loop: wake in the dungeon, learn the rules, clear the final gate, return to the village, prepare another descent, and keep local-first progress. The lore, mechanics, and curated runtime assets belong to opendungeon itself.

AI-generated or GM-created content should not overwrite this canonical story path. It can inspire future authored updates, but it should enter the game through reviewed code, content packs, or explicit player opt-in.

## Multiplayer

Multiplayer uses the same authored story loop, mechanics, lore, and assets, but adds multiple players to the shared dungeon and village. The target feel is Stardew-style co-op: shared farm and village state, separate player houses, shared dungeon objectives, and permissions for storage, upgrades, and shop/farm work.

The current CLI host is the first implementation. It can run same-laptop or LAN sessions, but internet-grade co-op still needs a stronger authoritative sync model.

## Multiplayer with GM

Multiplayer with GM is for a logged-in Dungeon Master or Game Master. The GM uses a website console to watch connected players, read action logs, prompt an AI assistant, preview tool-call output, generate small terminal-safe sprites, and approve validated changes before players receive them.

GM content belongs to a GM-created world in Supabase. New lore, room layouts, quests, monster variants, and generated assets must stay separate from the canonical Single Player story and from other users' worlds.

## Current status

- `/create` creates invite pages and commands for CLI-hosted multiplayer.
- `/gm` is a logged-in website shell for the future GM console.
- The terminal client still owns the current live game loop.
- Realtime GM patches need Supabase world ownership, schema validation, an AI Gateway chat route, tool-call audit records, and a realtime delivery path before players can receive generated changes.
