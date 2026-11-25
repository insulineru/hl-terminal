#!/usr/bin/env bash
# Pack this repo and install the tarball with bun and npm, then boot the CLI.
# Uses a throwaway HOME so it never reads or writes ~/.hyperliquid.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

tarball_name="$(npm pack --pack-destination "$work" | tail -n 1)"
tarball="$work/$tarball_name"
if [[ ! -f "$tarball" ]]; then
  tarball="$tarball_name"
fi
echo "packed $tarball"

smoke() {
  local pm="$1"
  local dir="$work/$pm"
  mkdir -p "$dir"
  if [[ "$pm" == "bun" ]]; then
    (cd "$dir" && bun add "$tarball")
  else
    (cd "$dir" && npm install "$tarball")
  fi

  local bin="$dir/node_modules/.bin/hl-terminal"
  local incur_version
  incur_version="$(node -p "require('$dir/node_modules/incur/package.json').version")"
  echo "=== $pm incur@${incur_version} ==="
  if [[ "$incur_version" != "0.3.13" ]]; then
    echo "expected incur 0.3.13, got $incur_version" >&2
    exit 1
  fi

  echo "=== $pm --version ==="
  "$bin" --version

  local home="$work/home-$pm"
  mkdir -p "$home"
  echo "=== $pm price BTC ==="
  HOME="$home" "$bin" account watch 0x0000000000000000000000000000000000000001 --name smoke
  HOME="$home" "$bin" price BTC
}

smoke bun
smoke npm
echo "clean-install smoke passed"
