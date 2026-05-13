# Game mechanics

opendungeon separates deterministic rules from presentation. Movement, combat rolls, loot, quest state, NPC interactions, and floor events all run through the game session layer so terminal UI, headless tests, and future network sync can share the same rules.

## Deterministic state

- Dungeon floors are generated from a seed.
- Legal movement can reveal fog, trigger traps, enter combat, pick up loot, or move the run to a new floor.
- Saves preserve the active run, player stats, inventory, quest state, map discovery, and local metadata.
- The headless runner can replay scripted actions and assert invariants without depending on terminal rendering.

## Interaction rules

Players interact with nearby people, notes, doors, loot, stairs, world events, merchants, and combat targets. The engine resolves whether the player is in exploration, dialogue, village, inventory, map, or combat state before accepting an action.

## Talent checks

opendungeon uses a tabletop RPG style check for risky loot and events. A talent check rolls a d20, which means a twenty-sided die. The formula is:

```txt
d20 + stat modifier + luck/level/relic bonuses >= difficulty
```

The prompted stat matters. A relic inscription can ask for Intelligence, a cache can ask for Dexterity, and a wounded courier can ask for Luck. Rolling 20 is always a dramatic success; rolling 1 is always a failure. Success gives the clean reward, while failure usually still salvages something but adds a cost such as damage, lost focus, or a cursed item. After a check, the toast and log tell you whether it passed, what you received, and to press `I` to inspect the inventory.

## Book and Monstrary

The Book is split by category: story notes, people, and monsters. Monster entries appear when you encounter a creature. Weaknesses are hidden until you hit with the right kind of attack, then the game updates the monster note and shows a weakness toast.

## Failure and recovery

The game should expose bad states clearly instead of silently losing progress. Save backups, export commands, deterministic seeds, and scripted smoke tests are all part of making failures recoverable.

## Planned polish

- Better reduced-motion and camera settings.
- More direct diagnostics for blocked multiplayer joins.
- Richer checks around save import, cloud save drift, and AI-admin patch validation.
