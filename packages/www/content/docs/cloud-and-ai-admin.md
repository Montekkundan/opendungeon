# GM and AI worlds

AI is scoped to logged-in GM worlds. Single Player and normal co-op use the authored rules, lore, and assets; GM sessions can add approved AI-assisted changes that respect the game rules.

## Content boundary

Generated content should become world notes, quests, dialogue branches, monster variants, sprites, or event text. It should not become arbitrary code running inside the game.

## Validation

- Validate patch shape before applying it.
- Keep generated content tied to a seed, world id, or account boundary.
- Log what changed so a player can understand why the world evolved.
- Preserve rollback paths for bad patches.

## Account-backed worlds

Logged-in GM worlds can store profile-linked ownership, cloud saves, and future world metadata. Public docs and invite pages should stay readable without login.

## Future admin loop

The long-term loop is: read what players did, draft a possible change, review it, then apply it to the GM world.

## Multiplayer with GM

The GM console should use a chat-style workflow. The model can propose lore, level changes, sprite prompts, and asset ideas, but each output should be validated, previewed, and stored under the GM-created world before players see it.

Generated GM content must not mix with canonical Single Player story or assets. Treat the GM world as the ownership boundary for generated lore, rooms, monsters, quests, and sprites.

Current shape:

- `/gm` is a logged-in website page.
- The GM can connect it to a running host URL.
- The page can show connected players and recent host activity.
- Drafts and approvals stay tied to the GM world.
- Terminal clients can receive approved GM updates.

Remaining GM work is rollback, generated asset review, per-world asset storage, live transcript updates, and a more polished chat interface.
