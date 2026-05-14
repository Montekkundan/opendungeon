export const installCommand =
  "curl -fsSL https://opendungeon.xyz/install | bash";

export const installScriptHeaders = {
  "cache-control": "public, max-age=300",
  "content-type": "text/x-shellscript; charset=utf-8",
};

export const opendungeonInstallScript = `#!/usr/bin/env sh
set -eu

APP="opendungeon"
PACKAGE="@montekkundan/opendungeon"
REPO="\${OPENDUNGEON_REPO:-Montekkundan/opendungeon}"
INSTALL_DIR="\${OPENDUNGEON_INSTALL_DIR:-$HOME/.opendungeon}"
BIN_DIR="\${OPENDUNGEON_BIN_DIR:-$HOME/.local/bin}"
REQUESTED_VERSION="\${OPENDUNGEON_VERSION:-latest}"
INSTALL_METHOD="\${OPENDUNGEON_INSTALL_METHOD:-auto}"

usage() {
  cat <<EOF
opendungeon installer

Usage:
  curl -fsSL https://opendungeon.xyz/install | bash
  curl -fsSL https://opendungeon.xyz/install | bash -s -- --version 0.1.5

Options:
  -h, --help                Show this help text.
  -v, --version <version>   Install a specific version.
      --install-dir <path>  Directory for release binaries. Default: $INSTALL_DIR
      --bin-dir <path>      Directory for executable symlinks. Default: $BIN_DIR
      --package             Install the npm package instead of release binaries.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -v|--version)
      shift
      if [ "$#" -eq 0 ]; then
        echo "Error: --version requires a value." >&2
        exit 1
      fi
      REQUESTED_VERSION="$1"
      shift
      ;;
    --install-dir)
      shift
      if [ "$#" -eq 0 ]; then
        echo "Error: --install-dir requires a path." >&2
        exit 1
      fi
      INSTALL_DIR="$1"
      shift
      ;;
    --bin-dir)
      shift
      if [ "$#" -eq 0 ]; then
        echo "Error: --bin-dir requires a path." >&2
        exit 1
      fi
      BIN_DIR="$1"
      shift
      ;;
    --package)
      INSTALL_METHOD="package"
      shift
      ;;
    *)
      echo "Warning: unknown option $1" >&2
      shift
      ;;
  esac
done

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

detect_target() {
  raw_os="$(uname -s)"
  raw_arch="$(uname -m)"

  case "$raw_os" in
    Darwin*) platform="darwin" ;;
    Linux*) platform="linux" ;;
    *)
      echo "Unsupported OS for binary install: $raw_os" >&2
      return 1
      ;;
  esac

  case "$raw_arch" in
    arm64|aarch64) cpu="arm64" ;;
    x86_64|amd64) cpu="x64" ;;
    *)
      echo "Unsupported architecture for binary install: $raw_arch" >&2
      return 1
      ;;
  esac
}

latest_release_tag() {
  curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": *"\\([^"]*\\)".*/\\1/p' | head -n 1
}

install_package() {
  version="\${REQUESTED_VERSION#v}"
  if [ -z "$version" ] || [ "$version" = "latest" ]; then
    spec="$PACKAGE"
  else
    spec="$PACKAGE@$version"
  fi

  echo "Installing opendungeon from npm package: $spec"
  if command_exists npm; then
    npm install -g "$spec"
  elif command_exists bun; then
    bun add -g "$spec"
  else
    echo "Error: npm or bun is required for package fallback." >&2
    echo "Install Node.js or Bun, then run: npm install -g $spec" >&2
    exit 1
  fi
}

install_release_binary() {
  command_exists curl || { echo "Error: curl is required." >&2; return 1; }
  command_exists tar || { echo "Error: tar is required." >&2; return 1; }
  detect_target || return 1

  tag="$REQUESTED_VERSION"
  if [ -z "$tag" ] || [ "$tag" = "latest" ]; then
    tag="$(latest_release_tag)"
  fi
  if [ -z "$tag" ]; then
    echo "No GitHub release tag found." >&2
    return 1
  fi

  version="\${tag#v}"
  archive="$APP-v$version-$platform-$cpu.tar.gz"
  url="https://github.com/$REPO/releases/download/v$version/$archive"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT INT TERM

  echo "Installing opendungeon $version for $platform-$cpu"
  echo "Downloading $url"
  curl -fsSL "$url" -o "$tmp/$archive" || return 1

  rm -rf "$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR" "$BIN_DIR"
  tar -xzf "$tmp/$archive" -C "$INSTALL_DIR"

  ln -sf "$INSTALL_DIR/bin/opendungeon" "$BIN_DIR/opendungeon"
  ln -sf "$INSTALL_DIR/bin/opendungeon-host" "$BIN_DIR/opendungeon-host"

  echo "Installed opendungeon $version to $INSTALL_DIR"
  echo "Executable: $BIN_DIR/opendungeon"
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) echo "Add $BIN_DIR to PATH if opendungeon is not found." ;;
  esac
}

if [ "$INSTALL_METHOD" = "package" ]; then
  install_package
elif install_release_binary; then
  :
else
  echo "Release binary install failed; falling back to the npm package."
  install_package
fi
`;
