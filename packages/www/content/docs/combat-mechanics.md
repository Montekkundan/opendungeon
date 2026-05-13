# Combat mechanics

Combat is turn-based and d20-driven. The goal is readable tension in a terminal surface: clear targets, clear odds, short action text, and visible consequences.

## Rolls

- Initiative decides order.
- Actions use d20 rolls with stat modifiers: `d20 + Strength`, `d20 + Dexterity`, `d20 + Intelligence`, and so on.
- Natural 20s always hit harder. Natural 1s always miss.
- Focus can power stronger options or defensive recovery.
- Flee rolls give the player a risky exit when the fight turns bad.

## Skills and stats

Each combat skill has a stat and an attack affinity:

- `Strike`: Strength, Physical.
- `Aimed Shot`: Dexterity, Precision.
- `Arcane Burst`: Intelligence, Arcane.
- `Smite`: Faith, Holy.
- `Shadow Hex`: Mind, Shadow.
- `Lucky Riposte`: Luck, Luck.

Pick skills by asking two questions: which stat is strong on your crawler, and what is this monster weak to? A strong stat makes the d20 total easier to land. A weakness adds damage after the hit. A resistance reduces damage, so using the wrong skill can make a fight drag even if the roll succeeds.

## Status effects

- Poison pressures long fights.
- Burn punishes staying exposed.
- Guarded reduces incoming damage.
- Weakened lowers offensive pressure.
- Stun interrupts action rhythm.
- Boss phases can change behavior at health thresholds.

## Enemy behavior

Enemies should not all feel identical. Some pursue, some ambush, some protect casters, some punish corridors, and bosses should clearly signal phase shifts.

## Strategy loop

Combat is meant to read like a small tactical puzzle, closer to elemental matchups than pure damage racing. Slimes dislike Arcane and Precision. Ghouls dislike Holy. Rust squires resist plain physical attacks until magic or hexes crack the armor. When you discover a weakness, the game updates the monster note in the Book and shows a toast so you know to check the Monstrary tab.

## Headless checks

Combat needs headless coverage for action legality, target selection, status expiry, flee results, death handling, and save consistency after a fight.
