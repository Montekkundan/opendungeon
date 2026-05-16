# Core loop

The core loop is exploration, decision, consequence, and recovery. The player moves through a replayable dungeon layout, discovers events, resolves danger, and carries run state forward through local saves.

## Run start

A run begins from a dungeon code, player build, and starting state. The code controls floor shape, placement, and deterministic content. The player state controls stats, focus, inventory, quest flags, and map discovery.

## Exploration

- Move one tile at a time.
- Reveal fog around the player.
- Check nearby interactables.
- Trigger traps, notes, doors, loot, stairs, merchants, and combat.
- Write run log entries for meaningful state changes.

## Decision pressure

The player should make small tactical choices often: spend focus or save it, inspect a suspicious chest or hurry, fight or flee, buy healing or save coins, finish a quest or push deeper.

## Persistence

Autosaves and explicit saves keep the run recoverable. Export backups make it possible to move state between machines or inspect a broken state while debugging.
