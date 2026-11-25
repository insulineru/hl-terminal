#!/usr/bin/env bash
set -euo pipefail

# Release script for hl-terminal
# Uses zile build + changeset publish + 1Password for npm OTP.
# changeset publish creates the vX.Y.Z tag. This script does not create a second one
# when that tag already points at HEAD.
#
# Usage:
#   ./scripts/release.sh            # publish to npm
#   ./scripts/release.sh --dry-run  # simulate without publishing

# changeset publish tags the release. Skip a matching tag at HEAD.
# Fail if that tag name already points at a different commit.
ensure_release_tag() {
  local version="$1"
  local tag="v${version}"
  if git rev-parse -q --verify "refs/tags/${tag}" >/dev/null; then
    local tagged head
    tagged="$(git rev-list -n 1 "$tag")"
    head="$(git rev-parse HEAD)"
    if [[ "$tagged" == "$head" ]]; then
      echo "✔ Tag ${tag} already exists at HEAD"
      return 0
    fi
    echo "✗ Tag ${tag} already exists but points at ${tagged}, not HEAD ${head}" >&2
    return 1
  fi
  git tag -a "$tag" -m "$tag"
  echo "✔ Created tag ${tag}"
}

main() {
  DRY_RUN=false
  if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    echo "⚠ DRY RUN — nothing will be published"
    echo ""
  fi

  echo "→ Checking prerequisites..."

  # Verify clean working tree (allow untracked)
  if [ -n "$(git diff --cached --name-only)" ]; then
    echo "✗ Staged changes detected. Commit or unstage before releasing."
    exit 1
  fi

  if [ -n "$(git diff --name-only)" ]; then
    echo "✗ Uncommitted changes detected. Commit or stash before releasing."
    exit 1
  fi

  # Verify npm auth
  if ! npm whoami &>/dev/null; then
    echo "✗ Not logged in to npm. Run: npm login"
    exit 1
  fi

  # Verify 1Password CLI
  if ! command -v op &>/dev/null; then
    echo "✗ 1Password CLI (op) not found."
    exit 1
  fi

  echo "✔ Prerequisites OK (npm: $(npm whoami))"

  # Save package.json before zile overwrites it.
  # This trap runs on success and on failure, including a tag check that returns 1.
  cp package.json package.json.bak
  trap 'mv package.json.bak package.json 2>/dev/null || true' EXIT

  echo "→ Building package..."
  bun run build

  echo "→ Pointing the published bin at node..."
  node scripts/fix-dist-shebang.mjs

  echo "→ Normalizing published package.json (bin paths)..."
  npm pkg fix

  VERSION=$(node -p "require('./package.json').version")
  echo "✔ Built hl-terminal@$VERSION"

  if $DRY_RUN; then
    echo ""
    echo "→ Dry run: checking what would be published..."
    npm pack --dry-run 2>&1
    echo ""
    echo "✔ Dry run complete. Run without --dry-run to publish."
    exit 0
  fi

  echo "→ Getting npm OTP from 1Password..."
  OTP=$(op item get "Npmjs" --otp)

  echo "→ Publishing to npm..."
  npx changeset publish --otp="$OTP"

  echo "→ Checking git tag..."
  ensure_release_tag "$VERSION"

  echo ""
  echo "✔ Published hl-terminal@$VERSION"
  echo ""
  echo "Next steps:"
  echo "  git push --follow-tags origin main"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
