# Cloud and AI admin

The AI-admin direction is data-first. AI can propose content, but the game should only accept validated patches that match the schema and respect deterministic rules.

## Content boundary

Generated content should become structured world config, asset metadata, quests, dialogue branches, monster variants, or event text. It should not become arbitrary code running inside the game.

## Validation

- Validate patch shape before applying it.
- Keep generated content tied to a seed, world id, or account boundary.
- Log what changed so a player can understand why the world evolved.
- Preserve rollback paths for bad patches.

## Supabase role

Supabase can store accounts, profiles, cloud saves, and future world metadata. RLS should protect user-owned rows, while public docs and invite pages stay readable without login.

## Future admin loop

The long-term loop is player action log, validated generation request, candidate patch, review or automated policy check, then deterministic game application.

## Multiplayer with GM

The GM console should use the AI Elements chatbot pattern with Vercel AI SDK and AI Gateway. The model can propose tool calls for lore, level patches, sprite prompts, and asset generation, but each output should be validated, previewed, and stored under the GM-created Supabase world before players see it.

Generated GM content must not mix with canonical Single Player story or assets. Treat the Supabase world id as the ownership boundary for generated lore, rooms, monsters, quests, and sprites.
