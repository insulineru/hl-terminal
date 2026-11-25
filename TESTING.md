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
# Expected: orders array with oid, coin, side, size, price, orderType, triggerPx, triggerCondition, isMarket, reduceOnly, tpsl
# Stop orders: triggerPx is the activation price (the limit in price is the slippage bound)
# A trigger with size 0 shows "full position". A partial TP/SL keeps its size, for example "0.25"
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

> **Warning**: These execute real trades on mainnet. Use `--dry-run` for safety.

The CLI flag is `--dry-run`. Command output uses the field `dryRun`. `--dry-run true` and `--dry-run false` both work. Do not write the flag as `--dryRun`.

### order

```bash
# Dry-run market buy
hl-terminal order create BTC buy 0.001 --dry-run
# Expected: dryRun: true, preview of the order

# Dry-run limit order
hl-terminal order create ETH buy 0.01 1500 --dry-run
# Expected: dryRun: true, limit order preview

# Dry-run sell stop-market (no order is sent).
# Default slippage is 3%. --slippage 10 matches the Hyperliquid UI bound.
hl-terminal order trigger BTC sell 0.5 --trigger 56666 --slippage 10 --dry-run
# Expected: dryRun: true, type: stop-market, triggerPx: "56666", isMarket: true,
# reduceOnly: false, tpsl: sl, size: "0.5", oid: null
# limitPx is the trigger adjusted by slippage, not the trigger itself

# Dry-run buy stop-limit
hl-terminal order trigger BTC buy 0.1 --trigger 100000 --limit 100500 --dry-run
# Expected: type: stop-limit, isMarket: false, triggerPx: "100000", limitPx: "100500"

# Take-profit style. type follows --tpsl, not a stop-* name.
hl-terminal order trigger BTC sell 0.5 --trigger 100000 --tpsl tp --dry-run
# Expected: dryRun: true, type: take-profit-market, tpsl: tp

# Boolean flags accept true/false after a space. true/false is never a price.
hl-terminal order create BTC buy 0.001 --reduce-only true --dry-run
# Expected: dryRun: true, reduceOnly: true, type: market (price is not "true")

hl-terminal order trigger BTC sell 0.5 --trigger 56666 --reduce-only false --dry-run
# Expected: dryRun: true, reduceOnly: false
hl-terminal order trigger BTC sell 0.5 --trigger 56666 --reduce-only=false --dry-run
hl-terminal order trigger BTC sell 0.5 --trigger 56666 --no-reduce-only --dry-run

# Cancel all (dry)
hl-terminal order cancel-all --dry-run
# Expected: shows what would be cancelled, including triggerPx on trigger orders
```

### position

```bash
# Set leverage (dry)
hl-terminal position leverage BTC 10 --dry-run
# Expected: dryRun: true, leverage preview
```

## Testnet: trigger that flips a position

Run this only with `--testnet` and a testnet account. It places real testnet orders. Do not run it on mainnet.

The sequence opens a 0.001 long, rests a 0.002 sell stop below the mark (that size closes the long and opens a 0.001 short), checks the resting order, cancels a far trigger, and leaves one stop to fire.

```bash
# Mark price, so the triggers below are actually below it
hl-terminal price BTC --testnet

# 1. Open a 0.001 long
hl-terminal order create BTC buy 0.001 --testnet

# 2. Far sell stop, used only to confirm cancel. Pick a price well below the mark.
hl-terminal order trigger BTC sell 0.002 --trigger <far-below-mark> --slippage 10 --tpsl sl --testnet
hl-terminal orders --testnet
# Expected: oid, side Sell, size 0.002, triggerPx <far-below-mark>, isMarket true,
# reduceOnly false, tpsl sl, triggerCondition set

# 3. Cancel that far trigger and confirm it is gone
hl-terminal order cancel <oid> --testnet
# Expected: cancelled.triggerPx is the far trigger
hl-terminal orders --testnet

# 4. Sell stop below the mark, sized to flip 0.001 long into 0.001 short
hl-terminal order trigger BTC sell 0.002 --trigger <below-mark> --slippage 10 --tpsl sl --testnet
hl-terminal orders --testnet
# Expected: resting oid, triggerPx <below-mark>, size 0.002, reduceOnly false

# 5. After price trades through the trigger, the position should be a short of about 0.001
hl-terminal positions --testnet
hl-terminal fills BTC --testnet
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
