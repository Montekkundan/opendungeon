# OpenDungeon AI Sprite Generation Skill

Use this skill when generating OpenDungeon sprites, tiles, icons, portraits, or biome art for the AI-admin asset pipeline.

## Goal

Create project-owned pixel art that survives OpenTUI terminal rendering. The final art is displayed as colored terminal cells, usually with half-block sampling where one character cell represents two vertical pixels. Small, readable silhouettes matter more than high source resolution.

## Global Rules

- Create original art. Do not copy Stardew Valley, itch.io packs, commercial games, copyrighted characters, logos, or source sheets.
- Use crisp pixel art only: no antialiasing, blur, painterly texture, gradients, soft lighting, bloom, vector smoothness, or 3D render style.
- Use transparent backgrounds for actors, NPCs, enemies, animals, loot, weapons, and UI icons.
- Use hard-edged indexed palettes. Prefer 8 to 24 colors per sheet; icons should usually use 2 to 6 colors.
- Prefer large shapes and strong contrast. Avoid 1-pixel noise, dithering fields, tiny facial detail, and thin outlines that disappear in terminal cells.
- Keep every sprite centered inside its frame with at least 1 pixel of breathing room.
- Use a consistent top-down RPG perspective with a slight front-facing read, not side-scroller perspective.
- No text inside generated images.

## Runtime Sizes

OpenDungeon currently renders best from tiny source grids:

- Actors and NPCs: `18x18` pixels per frame.
- Animals, minions, small props: `16x16` or `18x18` pixels per frame.
- Terrain tiles, items, weapons, UI icons: `8x8` pixels per frame.
- Portraits and larger dialog art: `32x32` or `48x48`, but still simple enough to downsample.

If a model cannot output exact tiny dimensions, generate a clean sprite sheet with large margins, then post-process down to these frame sizes with nearest-neighbor scaling.

## Actor Sheets

Generate one animation per PNG sheet when possible. Each sheet should be a horizontal strip with equal-sized frames.

Required actor animations:

- `idle`: 2 to 4 frames, subtle breathing only.
- `walk`: 4 frames, clear feet/robe/weapon motion.
- `attack-melee`: 4 frames, windup, impact, recover, return.
- `attack-ranged`: 4 frames, aim, release/cast, impact pose, recover.
- `hurt`: 2 frames, readable recoil.
- `death`: 4 frames, collapse or fade pose.

Actor frame contract:

- Frame size: exactly `18x18`.
- Default frame count: 4 frames horizontally.
- Canvas for a 4-frame sheet: `72x18`.
- Transparent background.
- The first idle frame must be a good static standing sprite.
- Movement animation should only be visually active while the character moves, so do not make idle frames look like walking.

## Character Design

Create readable RPG class silhouettes:

- Ranger: small cloak, hood or cap, short blade or bow, green/earth palette.
- Warrior: broad stance, visible armor plates, sword or axe, steel and red/brown accents.
- Mage: robe mass, staff or wand, high-contrast hat/hood, blue/purple/gold accents.
- Cleric: simple tabard, mace/book/charm, cream/gold/teal accents.
- Merchant/NPC: no combat pose, clear prop such as pack, map, lantern, or apron.
- Enemy: distinct silhouette first, then color. Avoid tiny facial details.
- Boss: wider or taller silhouette, crown/horns/banner/weapon shape, but still readable at `18x18`.

## Terrain Tiles

Terrain must be calmer than actors. The game view repeats tiles heavily, so avoid noisy texture.

Generate `8x8` tiles for:

- stone floor
- moss floor
- cracked floor
- dirt path
- grass
- crop rows
- wall face
- wall top
- shadow wall
- water
- door
- stairs
- chest
- shrine
- tree
- rock
- fence
- bridge

Terrain frame contract:

- Frame size: exactly `8x8`.
- Keep the main color field mostly solid.
- Use 1 to 3 accent clusters per tile, not full-tile checker noise.
- Use darker borders for walls and props.
- Floor tiles must be lower contrast than actors and items.

## UI Icons And Items

Generate `8x8` transparent icons for quickbar and inventory:

- sword
- bow
- staff
- shield
- potion
- coin
- map
- scroll
- pack
- key
- lockpick
- food
- gem
- torch
- trap
- quest marker

Icon rules:

- Use one clear object silhouette.
- Prefer 2 to 5 colors plus transparency.
- Use a dark outline only when it improves readability.
- Avoid small labels, sparks, dust, and background boxes.

## Prompt Template

Use this prompt pattern for image generation:

```text
Original crisp pixel art for OpenDungeon, a terminal-rendered top-down RPG.
Asset type: <actor | enemy | npc | boss | terrain | icon | item | portrait>.
Frame contract: <18x18 4-frame horizontal sheet | 8x8 tile atlas | 8x8 icon sheet>.
Subject: <specific subject>.
Style constraints: hard pixels, transparent background where applicable, no antialiasing, no blur, no gradients, no text, strong silhouette, limited palette, readable after half-block terminal downsampling.
Animation frames: <idle/walk/attack/hurt/death poses if actor>.
Palette: <3-6 dominant colors plus outline/shadow>.
Avoid: copyrighted characters, Stardew Valley likeness, copied itch.io assets, noisy texture, tiny details.
```

## Review Checklist

Reject or regenerate if:

- It looks smooth, blurred, painted, or anti-aliased.
- It depends on fine details below 2 pixels.
- The terrain is noisy when tiled.
- The actor is unreadable at `18x18`.
- The idle frame looks like walking.
- The background is not transparent for actors/items/icons.
- The image contains text or UI labels.
- The asset resembles a known copyrighted game sprite or a downloaded asset pack too closely.

