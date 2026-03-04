# Roadmap: Hyperliquid CLI

## Overview

Build a Bun+TypeScript CLI for trading on Hyperliquid that works for humans in the terminal and AI agents via MCP. Three phases: establish the foundation with account management and read-only market data, then add trade execution, then add live WebSocket streaming. The MCP/JSON/TOON agent integration is wired in from Phase 1 because `incur` provides it for free.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Account management, all read commands, and agent integration wired in from day one (2026-03-03)
- [x] **Phase 1.5: Developer Experience** - INSERTED: oxlint, oxfmt, changesets, zile build, and knip wired in for a wevm-style DX before feature work continues (2026-03-03)
- [x] **Phase 2: Trade Execution** - Full order lifecycle — place, cancel, leverage, TP/SL — on top of the validated foundation (2026-03-04)
- [ ] **Phase 3: Live Streaming** - WebSocket watch mode for real-time position and P&L updates

## Phase Details

### Phase 1: Foundation

**Goal**: Traders can manage accounts and read all market state from the terminal or via an AI agent
**Depends on**: Nothing (first phase)
**Requirements**: INFR-01, INFR-02, INFR-03, ACCT-01, ACCT-02, ACCT-03, ACCT-04, READ-01, READ-02, READ-03, READ-04, READ-05, READ-06, READ-07, AGNT-01, AGNT-02, AGNT-03, AGNT-04
**Success Criteria** (what must be TRUE):

1. User can add a private key account, list accounts with masked keys, remove an account, and switch the default — keys stored in `~/.hyperliquid/` with 600 permissions
2. User can run `hl price BTC`, `hl balance`, `hl positions`, `hl orders`, `hl markets`, `hl funding` and get structured output
3. Running `hl --mcp` starts a working MCP server that an AI agent can call to execute any read command
4. Running any command with `--json` returns machine-readable JSON; `hl --llms` returns the command manifest
5. `hl --version` and `hl --help` (on any command) work; `--testnet` flag switches all API calls to the testnet endpoint
   **Plans**: 5 plans

Plans:

- [x] 01-01: Project scaffold, dependencies, and incur CLI entry point
- [x] 01-02: Config layer (`src/lib/config.ts`) — account CRUD, file permissions, testnet flag
- [x] 01-03: Client middleware (`src/lib/client.ts`) — InfoClient injection, formatting utilities
- [x] 01-04: Account commands (`hl account add/list/remove/switch`)
- [x] 01-05: Read commands (`hl price`, `hl balance`, `hl positions`, `hl orders`, `hl markets`, `hl funding`)

### Phase 1.5: Developer Experience (INSERTED)

**Goal**: The project has wevm-style DX — linting, formatting, build pipeline, and release workflow — so contributors and maintainers work with fast, consistent tooling
**Depends on**: Phase 1
**Requirements**: DX-01, DX-02, DX-03, DX-04, DX-05
**Success Criteria** (what must be TRUE):

1. `bun run check` runs oxlint and oxfmt and passes with zero issues
2. `bun run build` produces a compiled `dist/` via zile (matching how incur itself is built)
3. `bun run knip` passes with zero unused exports/deps
4. `changeset` workflow is wired: `bun run changeset` adds a changeset, `bun run release` bumps version and publishes to npm
5. All configs (`.oxlintrc.json`, `.oxfmtrc.jsonc`, `knip.json`) committed and enforced
   **Plans**: 3 plans

Plans:

- [x] 01.5-01-PLAN.md — Install oxlint + oxfmt; create lint/format configs; fix all src/ issues; update knip.json
- [x] 01.5-02-PLAN.md — Install zile; restructure package.json with [!start-pkg] marker; verify compiled dist/index.js
- [x] 01.5-03-PLAN.md — Initialize @changesets/cli; set access:public; wire changeset/release scripts

### Phase 2: Trade Execution

**Goal**: Traders can place and manage orders on Hyperliquid from the terminal or via an AI agent
**Depends on**: Phase 1
**Requirements**: TRAD-01, TRAD-02, TRAD-03, TRAD-04, TRAD-05, TRAD-06, TRAD-07
**Success Criteria** (what must be TRUE):

1. User can place a limit order (`hl order create BTC buy 0.1 --price 50000 --tif GTC`) and receive a confirmed order ID
2. User can place a market order (`hl order create BTC buy 0.1`) and receive a filled confirmation
3. User can cancel an order by ID and cancel all open orders (with optional coin filter)
4. User can set leverage for a coin in cross or isolated mode (`hl position leverage BTC 10 --isolated`)
5. User can place a take-profit or stop-loss order with a trigger price against an open position
   **Plans**: 4 plans

Plans:

- [x] 02-01-PLAN.md — ExchangeClient middleware, asset resolution, and SDK precision utilities (2026-03-04)
- [x] 02-02-PLAN.md — Order commands (`hl order create`, `hl order cancel`, `hl order cancel-all`) (2026-03-04)
- [x] 02-03-PLAN.md — Position management commands (`hl position leverage`, `hl position tp`, `hl position sl`) (2026-03-04)
- [x] 02-04-PLAN.md — UAT gap closure: price as positional arg, examples/hint, README update (2026-03-04)

### Phase 3: Live Streaming

**Goal**: Traders can monitor open positions with live P&L updates without leaving the terminal
**Depends on**: Phase 2
**Requirements**: LIVE-01
**Success Criteria** (what must be TRUE):

1. User can run `hl positions -w` and see position P&L updating in real-time via WebSocket
2. The watch command reconnects automatically if the WebSocket connection drops
3. Running `hl positions -w` does not consume a persistent WS connection when invoked as a one-shot MCP tool call (WebSocketTransport only used for watch mode)
   **Plans**: TBD

Plans:

- [ ] 03-01: SubscriptionClient setup and WebSocket watch mode for positions (`hl positions -w`)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 1.5 -> 2 -> 3

| Phase                     | Plans Complete | Status      | Completed  |
| ------------------------- | -------------- | ----------- | ---------- |
| 1. Foundation             | 5/5            | Complete    | 2026-03-03 |
| 1.5. Developer Experience | 3/3            | Complete    | 2026-03-03 |
| 2. Trade Execution        | 4/4 | Complete   | 2026-03-04 |
| 3. Live Streaming         | 0/1            | Not started | -          |
