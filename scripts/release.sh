#!/usr/bin/env bash
set -euo pipefail

# Release script for hl-terminal
# Uses zile build + changeset publish + 1Password for npm OTP
#
# Usage:
#   ./scripts/release.sh            # publish to npm
#   ./scripts/release.sh --dry-run  # simulate without publishing

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

# Save package.json before zile overwrites it
cp package.json package.json.bak
trap 'mv package.json.bak package.json 2>/dev/null || true' EXIT

echo "→ Building package..."
bun run build

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

echo "→ Creating git tag..."
# Restore first so we read dev package.json
mv package.json.bak package.json
trap - EXIT
git tag -a "v$VERSION" -m "v$VERSION"

echo ""
echo "✔ Published hl-terminal@$VERSION"
echo ""
echo "Next steps:"
echo "  git push && git push --tags"
