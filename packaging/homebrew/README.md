# Homebrew

Run `bun run package:release` after tagging a release. It writes a checked formula to:

```text
dist/release/opendungeon.rb
```

Copy that file to a tap repository such as `homebrew-tap/Formula/opendungeon.rb`.

Install command after the tap exists:

```bash
brew install Montekkundan/tap/opendungeon
```
