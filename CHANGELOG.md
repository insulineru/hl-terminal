# Changelog

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
