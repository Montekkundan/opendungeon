#!/usr/bin/env sh
set -eu

REPO="${OPENDUNGEON_REPO:-Montekkundan/opendungeon}"
INSTALL_DIR="${OPENDUNGEON_INSTALL_DIR:-$HOME/.opendungeon}"
BIN_DIR="${OPENDUNGEON_BIN_DIR:-$HOME/.local/bin}"

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"

case "$os" in
  darwin) platform="darwin" ;;
  linux) platform="linux" ;;
  *) echo "Unsupported OS: $os" >&2; exit 1 ;;
esac

case "$arch" in
  arm64|aarch64) cpu="arm64" ;;
  x86_64|amd64) cpu="x64" ;;
  *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
esac

tag="${OPENDUNGEON_VERSION:-}"
if [ -z "$tag" ] || [ "$tag" = "latest" ]; then
  tag="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)"
fi

version="${tag#v}"
archive="opendungeon-v${version}-${platform}-${cpu}.tar.gz"
url="https://github.com/$REPO/releases/download/v${version}/${archive}"
tmp="$(mktemp -d)"

mkdir -p "$INSTALL_DIR" "$BIN_DIR"
curl -fsSL "$url" -o "$tmp/$archive"
tar -xzf "$tmp/$archive" -C "$INSTALL_DIR"
ln -sf "$INSTALL_DIR/bin/opendungeon" "$BIN_DIR/opendungeon"
ln -sf "$INSTALL_DIR/bin/opendungeon-host" "$BIN_DIR/opendungeon-host"

echo "Installed opendungeon $version to $INSTALL_DIR"
echo "Executable: $BIN_DIR/opendungeon"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Add $BIN_DIR to PATH if opendungeon is not found." ;;
esac
