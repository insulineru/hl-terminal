#!/usr/bin/env bash
# Build the publish manifest in a temp copy (zile + npm pkg fix), pack it, and
# install that tarball with bun and npm. Never reads or writes ~/.hyperliquid.
# `price BTC` is optional: skipped in CI, and a network failure does not fail the script.
set -euo pipefail

cd "$(dirname "$0")/.."
root="$(pwd)"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

copy="$work/src"
mkdir -p "$copy"
tar -C "$root" \
  --exclude node_modules \
  --exclude .git \
  --exclude dist \
  --exclude '*.tgz' \
  -cf - . | tar -C "$copy" -xf -
ln -s "$root/node_modules" "$copy/node_modules"

echo "=== publish prepare ==="
(
  cd "$copy"
  bunx zile publish:prepare
  node "$root/scripts/fix-dist-shebang.mjs" dist/index.js
  npm pkg fix
)

bin_target="$(node -p "require('$copy/package.json').bin['hl-terminal']")"
src_target="$(node -p "require('$copy/package.json').bin['hl-terminal.src']")"
echo "published bins: hl-terminal=$bin_target hl-terminal.src=$src_target"
if [[ "$bin_target" != "dist/index.js" ]]; then
  echo "expected bin hl-terminal to be dist/index.js, got $bin_target" >&2
  exit 1
fi
if [[ "$src_target" != "src/index.ts" ]]; then
  echo "expected bin hl-terminal.src to be src/index.ts, got $src_target" >&2
  exit 1
fi
shebang="$(head -n 1 "$copy/dist/index.js")"
echo "dist shebang: $shebang"
if [[ "$shebang" != "#!/usr/bin/env node" ]]; then
  echo "expected dist/index.js shebang to be node, got $shebang" >&2
  exit 1
fi

tarball_name="$(cd "$copy" && npm pack --pack-destination "$work" | tail -n 1)"
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

  local pkg="$dir/node_modules/hl-terminal/package.json"
  local installed
  installed="$(node -p "require('$pkg').bin['hl-terminal']")"
  if [[ "$installed" != "dist/index.js" ]]; then
    echo "$pm install bin is $installed, expected dist/index.js" >&2
    exit 1
  fi

  local incur_version
  incur_version="$(node -p "require('$dir/node_modules/incur/package.json').version")"
  echo "=== $pm incur@${incur_version} ==="
  if [[ "$incur_version" != "0.3.13" ]]; then
    echo "expected incur 0.3.13, got $incur_version" >&2
    exit 1
  fi

  echo "=== $pm hl-terminal --version ==="
  "$dir/node_modules/.bin/hl-terminal" --version
  echo "=== $pm hl-terminal.src --version ==="
  "$dir/node_modules/.bin/hl-terminal.src" --version

  if [[ "${CI:-}" == "true" || "${SMOKE_SKIP_PRICE:-}" == "1" ]]; then
    echo "=== $pm price BTC skipped ==="
    return
  fi

  local home="$work/home-$pm"
  mkdir -p "$home"
  echo "=== $pm price BTC ==="
  HOME="$home" "$dir/node_modules/.bin/hl-terminal" account watch 0x0000000000000000000000000000000000000001 --name smoke
  if ! HOME="$home" "$dir/node_modules/.bin/hl-terminal" price BTC; then
    echo "price BTC failed (network or rate limit); smoke continues" >&2
  fi
}

smoke bun
smoke npm
echo "clean-install smoke passed"
