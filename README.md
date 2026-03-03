# hl-terminal

Hyperliquid DEX terminal — read market data, manage accounts, and execute trades from the command line or via AI agent (MCP).

## Features

- **Market data** — prices, positions, orders, balances, funding rates, fill history
- **Account management** — add, remove, switch accounts with secure local storage
- **Agent-native** — built-in MCP server mode for AI agent integration
- **Machine-readable** — JSON output, LLM manifest, structured error codes
- **Testnet support** — `--testnet` flag for risk-free testing

## Installation

```bash
# bun (recommended)
bun add -g hl-terminal

# npm
npm install -g hl-terminal
```

## Quick Start

```bash
# Add your first account
hl account add --name main

# Check BTC price
hl price BTC

# View your positions
hl positions

# View your balance
hl balance

# List available markets
hl markets
```

## Commands

### Account Management

| Command                              | Description                           |
| ------------------------------------ | ------------------------------------- |
| `hl account add --name <n>`          | Add account (prompts for private key) |
| `hl account watch <addr> --name <n>` | Add read-only account (address only)  |
| `hl account ls`                      | List all accounts                     |
| `hl account rm <name>`               | Remove an account                     |
| `hl account switch <name>`           | Switch default account                |

### Market Data

| Command             | Description                                  |
| ------------------- | -------------------------------------------- |
| `hl price <coin>`   | Current mid-price for a coin                 |
| `hl balance`        | Perps margin + spot wallet balance           |
| `hl positions`      | Open positions with PnL, leverage, liq price |
| `hl orders`         | Open orders with side, size, price, type     |
| `hl markets`        | Available markets with metadata              |
| `hl funding [coin]` | Current funding rates or history for a coin  |
| `hl fills [coin]`   | Trade history with time range and pagination |

### Global Options

| Option          | Description            |
| --------------- | ---------------------- |
| `--testnet, -t` | Use testnet network    |
| `--json`        | Output as JSON         |
| `--mcp`         | Run as MCP server      |
| `--llms`        | Print command manifest |
| `--help`        | Show help              |
| `--version`     | Show version           |

## MCP Server

hl-terminal works as an [MCP](https://modelcontextprotocol.io) server for AI agents:

```bash
hl --mcp
```

All commands are exposed as tools that AI agents can call programmatically.

## Security

Private keys are stored locally at `~/.hyperliquid/config.json` with `0600` file permissions. Keys never leave your machine. Read-only watch accounts are available for monitoring without exposing any keys.

See [SECURITY.md](./SECURITY.md) for the full security policy.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](./LICENSE)
