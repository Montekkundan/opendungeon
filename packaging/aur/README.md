# Arch AUR

Run `bun run package:release` after tagging a release. It writes a checked `PKGBUILD` to:

```text
dist/release/PKGBUILD
```

Publish that file to an AUR package named `opendungeon-bin`.

Install command after the AUR package exists:

```bash
paru -S opendungeon-bin
```
