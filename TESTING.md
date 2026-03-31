# Manual Testing Checklist

Run after any changes to verify CLI works end-to-end against live Hyperliquid API.

**Prerequisite**: active account configured (`hl-terminal account ls` should show an account).

## Quick Smoke Test

```bash
bun run check:types          # TypeScript compiles
bun test                     # Unit tests pass
bun run src/index.ts --help  # CLI boots, shows commands
```

## Read-Only Commands

### price

```bash
# Standard coin
hl-terminal price BTC
# Expected: coin: BTC, mid: "<number>"

# Dex-qualified coin (HIP-3)
hl-terminal price xyz:BRENTOIL
# Expected: coin: "xyz:BRENTOIL", mid: "<number>"

# Case insensitive
hl-terminal price btc
# Expected: coin: BTC, mid: "<number>"

# Unknown coin → helpful error
hl-terminal price NONEXISTENT
# Expected: code: UNKNOWN_COIN, cta with "markets" suggestion
```

### markets

```bash
# List all markets
hl-terminal markets
# Expected: 300+ markets including dex-qualified names like "xyz:BRENTOIL", "abcd:USA500"

# Verify dex markets appear
hl-terminal markets | grep xyz:
# Expected: multiple xyz: entries (BRENTOIL, GOLD, TSLA, etc.)
```

### positions

```bash
# List open positions (may be empty)
hl-terminal positions
# Expected: positions array with coin, size, entryPx, unrealizedPnl, leverage, liquidationPx, side
# Dex positions should show qualified names like "xyz:BRENTOIL"
```

### orders

```bash
# List open orders
hl-terminal orders
# Expected: orders array with oid, coin, side, size, price, orderType
```

### balance

```bash
# View perps margin + spot balances
hl-terminal balance
# Expected: perps (accountValue, totalNtlPos, totalRawUsd) + spot array
```

### fills

```bash
# All fills (default limit 50)
hl-terminal fills
# Expected: fills array with time, coin, side, size, price, fee, closedPnl

# Filter by standard coin
hl-terminal fills BTC --limit 5
# Expected: only BTC fills

# Filter by dex coin
hl-terminal fills xyz:BRENTOIL
# Expected: only BRENTOIL fills with correct dex prefix

# Time range filter
hl-terminal fills --days 7 --limit 10
# Expected: only fills from last 7 days

# Empty result
hl-terminal fills NONEXISTENTCOIN123
# Expected: fills[], total: 0
```

### candles

```bash
# Default: 1h candles, ~24 bars
hl-terminal candles BTC
# Expected: coin: BTC, interval: 1h, candles with OHLCV data

# Custom interval and limit
hl-terminal candles ETH -i 15m -l 5
# Expected: 5 candles at 15m interval

# Daily candles
hl-terminal candles SOL --interval 1d --limit 7
# Expected: 7 daily candles

# Dex coin (HIP-3)
hl-terminal candles xyz:BRENTOIL --limit 5
# Expected: BRENTOIL candles with OHLCV data

# Dex daily candles
hl-terminal candles xyz:GOLD -i 1d -l 7
# Expected: 7 daily GOLD candles
```

### funding

```bash
# Specific coin history (7 days)
hl-terminal funding BTC
# Expected: rates array with fundingRate, premium, time

# All current rates (slow — queries all markets)
hl-terminal funding
# Expected: rates array for all markets
```

## Trade Commands (requires private key)

> **Warning**: These execute real trades on mainnet. Use `--dryRun` for safety.

### order

```bash
# Dry-run market buy
hl-terminal order create BTC buy 0.001 --dryRun
# Expected: dryRun: true, preview of the order

# Dry-run limit order
hl-terminal order create ETH buy 0.01 1500 --dryRun
# Expected: dryRun: true, limit order preview

# Cancel all (dry)
hl-terminal order cancel-all --dryRun
# Expected: shows what would be cancelled
```

### position

```bash
# Set leverage (dry)
hl-terminal position leverage BTC 10 --dryRun
# Expected: dryRun: true, leverage preview
```

## Network Options

```bash
# Testnet mode
hl-terminal price BTC --testnet
# Expected: testnet BTC price (may differ from mainnet)
```

## Edge Cases

```bash
# No account configured (after account rm)
# Expected: code: NO_ACCOUNT, cta with "account add" suggestion

# Watch-only account + trade command
# Expected: error about missing private key
```
