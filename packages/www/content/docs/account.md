# Account

You can play opendungeon without an account. The terminal game starts locally, and the core solo run does not need login.

## When login helps

Login is for website features around your profile, saved invite pages, and future cloud-backed worlds. It is useful when you want to make lobby pages easier to return to or when a GM-hosted world needs an owner.

## What players should know

- Local solo play works without login.
- Local co-op can use guest names from different terminal windows.
- A signed-in profile helps the website remember account-owned pages and future GM worlds.
- Normal co-op still needs a running `opendungeon-host` process.

## What stays local

The current game loop stays local-first. Your movement, fights, d20 checks, inventory, and village progress are owned by the terminal runtime unless you explicitly use account-backed website features.

## What comes later

The account path will support easier online lobbies, GM world ownership, and profile-linked saves. Those features should stay optional so the base dungeon crawler remains playable from the CLI.
