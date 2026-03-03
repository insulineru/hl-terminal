# Requirements: Hyperliquid CLI

**Defined:** 2026-03-03
**Core Value:** Traders can read market state and execute trades on Hyperliquid from the terminal or through an AI agent, with minimal latency and zero friction.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Account Management

- [x] **ACCT-01**: User can add an account with private key (stored in `~/.hyperliquid/` with 600 permissions)
- [x] **ACCT-02**: User can list saved accounts with masked key display
- [x] **ACCT-03**: User can remove a saved account
- [x] **ACCT-04**: User can switch default account

### Read Commands

- [x] **READ-01**: User can view current mid-price for a specific coin
- [x] **READ-02**: User can view all open positions with entry price, size, unrealized PnL, leverage, liquidation price
- [x] **READ-03**: User can view all open orders with order ID, side, size, price, type
- [x] **READ-04**: User can list available markets (perps + spot) with metadata (tick size, max leverage)
- [x] **READ-05**: User can view account balance (perps margin + spot wallet)
- [x] **READ-06**: User can view current funding rates for assets
- [x] **READ-07**: User can view funding history for a specific asset

### Trade Commands

- [x] **TRAD-01**: User can place a limit order with side, size, coin, price, and optional time-in-force (GTC/IOC/ALO) and reduce-only flag
- [x] **TRAD-02**: User can place a market order with side, size, coin, and optional slippage tolerance
- [x] **TRAD-03**: User can cancel an order by order ID
- [x] **TRAD-04**: User can cancel all open orders with optional coin filter
- [x] **TRAD-05**: User can set leverage for a coin (value + cross/isolated mode)
- [x] **TRAD-06**: User can place a take-profit order with trigger price
- [x] **TRAD-07**: User can place a stop-loss order with trigger price

### Agent Integration

- [x] **AGNT-01**: CLI operates as MCP server via `--mcp` flag (incur built-in)
- [x] **AGNT-02**: CLI exposes machine-readable command manifest via `--llms` flag (incur built-in)
- [x] **AGNT-03**: CLI outputs TOON format for token-efficient agent consumption (incur built-in)
- [x] **AGNT-04**: CLI supports JSON output mode for scripting and piping

### Live Updates

- [ ] **LIVE-01**: User can watch positions with live P&L updates via WebSocket (`-w` flag)

### Infrastructure

- [x] **INFR-01**: CLI supports testnet mode via `--testnet` flag (switches API endpoints + signing)
- [x] **INFR-02**: Every command provides `--help` with usage, arguments, and options
- [x] **INFR-03**: CLI entry point with `--version` flag

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Orders

- **ADVN-01**: User can place TWAP orders (30s intervals, slippage cap)
- **ADVN-02**: User can cancel running TWAP orders
- **ADVN-03**: User can view TWAP order status
- **ADVN-04**: User can place scale orders (distribute across price range)

### Extended Live Updates

- **LIVX-01**: User can watch order book depth in real-time
- **LIVX-02**: User can watch fills/user events in real-time

### Power Features

- **POWR-01**: User can modify existing orders in-place (batchModify)
- **POWR-02**: User can place batch orders in a single request
- **POWR-03**: User can cancel orders by client order ID
- **POWR-04**: User can transfer USDC between spot and perps margin
- **POWR-05**: User can approve API wallet for delegated trading
- **POWR-06**: User can set schedule cancel (dead man's switch)
- **POWR-07**: User can view fill history with time-range filter
- **POWR-08**: User can preview signed transactions without broadcasting (dry-run)

## Out of Scope

| Feature                              | Reason                                                  |
| ------------------------------------ | ------------------------------------------------------- |
| Interactive TUI / dashboard          | Defeats agent-native purpose; fights incur model        |
| Background daemon / caching server   | High operational complexity; state management nightmare |
| Charting / candlestick visualization | CLI charting always worse than web UI                   |
| Historical analytics / backtesting   | Different problem domain                                |
| Vault management                     | Complex multi-user product; not trading                 |
| Multi-chain support                  | Hyperliquid L1 only                                     |
| Strategy automation / bots           | CLI executes single actions; agents orchestrate         |
| Web UI companion                     | CLI only                                                |
| Order chaining / macros              | Agents orchestrate multi-step workflows                 |
| Price alerts / notifications         | Requires persistence and daemon                         |
| Staking / delegation commands        | Not trading                                             |
| Borrow/lend commands                 | Not trading workflow                                    |
| Sub-account trading                  | Complexity vs value unclear; validate demand first      |
| HIP-3 DEX abstraction (equities/FX)  | Niche; validate demand first                            |
| Referral management                  | Low value for trading workflow                          |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase     | Status   |
| ----------- | --------- | -------- |
| INFR-01     | Phase 1   | Complete |
| INFR-02     | Phase 1   | Complete |
| INFR-03     | Phase 1   | Complete |
| ACCT-01     | Phase 1   | Complete |
| ACCT-02     | Phase 1   | Complete |
| ACCT-03     | Phase 1   | Complete |
| ACCT-04     | Phase 1   | Complete |
| READ-01     | Phase 1   | Complete |
| READ-02     | Phase 1   | Complete |
| READ-03     | Phase 1   | Complete |
| READ-04     | Phase 1   | Complete |
| READ-05     | Phase 1   | Complete |
| READ-06     | Phase 1   | Complete |
| READ-07     | Phase 1   | Complete |
| AGNT-01     | Phase 1   | Complete |
| AGNT-02     | Phase 1   | Complete |
| AGNT-03     | Phase 1   | Complete |
| AGNT-04     | Phase 1   | Complete |
| TRAD-01     | Phase 2   | Complete |
| TRAD-02     | Phase 2   | Complete |
| TRAD-03     | Phase 2   | Complete |
| TRAD-04     | Phase 2   | Complete |
| TRAD-05     | Phase 2   | Complete |
| TRAD-06     | Phase 2   | Complete |
| TRAD-07     | Phase 2   | Complete |
| LIVE-01     | Phase 3   | Pending  |
| DX-01       | Phase 1.5 | Complete |
| DX-02       | Phase 1.5 | Complete |
| DX-03       | Phase 1.5 | Complete |
| DX-04       | Phase 1.5 | Complete |
| DX-05       | Phase 1.5 | Complete |

**Coverage:**

- v1 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0 ✓

---

_Requirements defined: 2026-03-03_
_Last updated: 2026-03-04 — TRAD-01–TRAD-04 completed by Plan 02-02, TRAD-05–TRAD-07 completed by Plan 02-03_
