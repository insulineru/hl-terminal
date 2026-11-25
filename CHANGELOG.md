# Changelog

## 0.5.1

### Patch Changes

- 7219dd7: Pinned incur to 0.3.13 so a fresh install no longer crashes while loading the MCP transport. Boolean flags accept a spaced true/false, and `--flag=value` also accepts 1/0/yes/no, without treating those words as a price. A spaced 1, 0, yes, or no stays a positional. Flags without a `--no-*` form drop a false value instead of crashing, and the last occurrence wins. HTTP 429 from Hyperliquid is reported as RATE_LIMITED with a retry hint, including when a builder-dex query is rate limited. Trigger output names take-profit orders, and an immediate fill points at positions instead of cancel. The published CLI runs on Node.

## 0.5.0

### Minor Changes

- b9d3298: Added `order trigger` for stop-market and stop-limit entries (`--tpsl sl|tp`), and showed trigger price, trigger condition, market, reduce-only, and TP/SL fields on open orders.

## 0.4.1

### Patch Changes

- ba81143: Fix: CLI no longer starts an unwanted development server on localhost:3000 when running commands

## 0.4.0

### Minor Changes

- c54a12e: Update incur to 0.3.13 — adds multiple output formats (toon, json, yaml, md, jsonl), output filtering, JSON Schema export, token management, shell completions, and built-in `mcp add` / `skills add` commands. Documentation updated with missing candles command, HIP-3 DEX market support, and new global options.

## 0.3.2

### Patch Changes

- Add release script with 1Password OTP support

## 0.3.1

### Patch Changes

- Fix CLI version display — read version from package.json instead of hardcoding

## 0.3.0

### Minor Changes

- Add trade execution commands: order create, cancel, cancel-all, and position leverage management

## 0.2.2

### Patch Changes

- Fix CLI binary name — remove `.src` suffix so users get `hl-terminal` command

## 0.2.1

### Patch Changes

- Rename CLI binary from `hl` to `hl-terminal` to avoid conflicts with other packages

## 0.2.0

### Minor Changes

- Open source readiness: added README, CONTRIBUTING, GitHub issue/PR templates, and CHANGELOG. Updated package metadata with repository, homepage, and bugs fields.

## 0.1.0

### Added

- Account management: `account add`, `account watch`, `account ls`, `account rm`, `account switch`
- Market data: `price`, `balance`, `positions`, `orders`, `markets`, `funding`, `fills`
- MCP server mode (`--mcp`) for AI agent integration
- JSON output mode (`--json`) and LLM manifest (`--llms`)
- Testnet support (`--testnet`)
- Secure local key storage at `~/.hyperliquid/config.json` with `0600` file permissions
- Read-only watch accounts (address only, no private key)
