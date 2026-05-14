# GM and AI worlds

AI is scoped to logged-in GM worlds. Single Player and normal co-op use the authored rules, lore, and assets; GM sessions can add approved AI-assisted patches that match the schema and respect deterministic rules.

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

Current implementation status:

- `/gm` is logged-in and Supabase-backed.
- GM worlds and patch draft events are stored under the signed-in owner.
- The page can read a live `opendungeon-host` `/state` URL and display connected players plus the latest host action log.
- The GM page renders a transcript-style history for host bridge state, patch drafts, approvals, and host archives.
- GM patch drafts now validate AI tool-call names against an allowlist. Unsafe tool names are ignored, and asset/import/apply/rollback tools stay in `needs-review` status.
- The host records movement, interaction, combat, inventory, village, and GM delivery actions, and also exposes them at `/actions` for debugging and GM tooling.
- Approved patches can be delivered to the host `/gm/patches` endpoint.
- Terminal clients receive approved patch notifications and apply validated enemy HP, enemy damage, encounter-pressure, and briefing operations.
- If `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` is configured, GM patch drafts call Vercel AI Gateway through the AI SDK; otherwise they use the deterministic rules fallback and label the draft as fallback-generated.

Remaining GM work is executable rollback, generated asset review/import, per-world asset storage, live transcript streaming, and replacing the local transcript scaffold with the installed AI Elements message/tool components.
